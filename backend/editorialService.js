const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');

// Optional Google GenAI SDK if key is configured
let GoogleGenAI = null;
try {
  const genaiPkg = require('@google/genai');
  GoogleGenAI = genaiPkg.GoogleGenAI || genaiPkg.default?.GoogleGenAI;
} catch (e) {
  // GenAI package optional
}

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'featured-images');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const FONTS_DIR = path.join(__dirname, 'fonts');
if (!fs.existsSync(FONTS_DIR)) {
  fs.mkdirSync(FONTS_DIR, { recursive: true });
}

// Register Kalpurush and Noto Serif Bengali fonts in @napi-rs/canvas for Skia/HarfBuzz Bengali conjunct shaping
const kalpurushFontPath = path.join(FONTS_DIR, 'Kalpurush.ttf');
if (fs.existsSync(kalpurushFontPath)) {
  try {
    GlobalFonts.registerFromPath(kalpurushFontPath, 'Kalpurush');
  } catch (err) {
    console.warn('[EditorialService] Canvas font registration note:', err.message);
  }
}
const notoBoldFontPath = path.join(FONTS_DIR, 'NotoSerifBengali-Bold.ttf');
if (fs.existsSync(notoBoldFontPath)) {
  try {
    GlobalFonts.registerFromPath(notoBoldFontPath, 'NotoSerifBengali');
  } catch (err) {}
}
const notoRegFontPath = path.join(FONTS_DIR, 'NotoSerifBengali-Regular.ttf');
if (fs.existsSync(notoRegFontPath)) {
  try {
    GlobalFonts.registerFromPath(notoRegFontPath, 'NotoSerifBengaliRegular');
  } catch (err) {}
}

let cachedKalpurushBase64 = null;
let cachedFontBoldBase64 = null;
let cachedFontRegularBase64 = null;
let fontconfigInitialized = false;

function ensureFontconfigRegistered() {
  if (fontconfigInitialized) return;
  try {
    const { execSync } = require('child_process');
    const userFontDir = path.join(process.env.HOME || '/root', '.fonts');
    if (!fs.existsSync(userFontDir)) {
      fs.mkdirSync(userFontDir, { recursive: true });
    }
    const kalpurushSrc = path.join(FONTS_DIR, 'Kalpurush.ttf');
    const kalpurushDest = path.join(userFontDir, 'Kalpurush.ttf');
    if (fs.existsSync(kalpurushSrc)) {
      if (!fs.existsSync(kalpurushDest) || fs.statSync(kalpurushDest).size !== fs.statSync(kalpurushSrc).size) {
        fs.copyFileSync(kalpurushSrc, kalpurushDest);
      }
      try {
        const sysFontDir = '/usr/local/share/fonts/kalpurush';
        if (!fs.existsSync(sysFontDir)) fs.mkdirSync(sysFontDir, { recursive: true });
        fs.copyFileSync(kalpurushSrc, path.join(sysFontDir, 'Kalpurush.ttf'));
      } catch (_) {}

      try {
        execSync(`fc-cache -f ${userFontDir}`, { stdio: 'ignore' });
      } catch (_) {}
    }
    fontconfigInitialized = true;
  } catch (err) {
    console.warn('[EditorialService] Font registration warning:', err.message);
  }
}

// Ensure font registration immediately
ensureFontconfigRegistered();

function getKalpurushBase64() {
  try {
    if (!cachedKalpurushBase64) {
      const kpPath = path.join(FONTS_DIR, 'Kalpurush.ttf');
      if (fs.existsSync(kpPath)) {
        cachedKalpurushBase64 = fs.readFileSync(kpPath).toString('base64');
      }
    }
  } catch (err) {
    console.warn('Error reading Kalpurush font:', err.message);
  }
  return cachedKalpurushBase64;
}

function getFontBase64() {
  try {
    if (!cachedFontBoldBase64) {
      const boldPath = path.join(FONTS_DIR, 'NotoSerifBengali-Bold.ttf');
      if (fs.existsSync(boldPath)) {
        cachedFontBoldBase64 = fs.readFileSync(boldPath).toString('base64');
      }
    }
    if (!cachedFontRegularBase64) {
      const regPath = path.join(FONTS_DIR, 'NotoSerifBengali-Regular.ttf');
      if (fs.existsSync(regPath)) {
        cachedFontRegularBase64 = fs.readFileSync(regPath).toString('base64');
      }
    }
  } catch (err) {
    console.warn('Error reading Bengali fonts for SVG:', err.message);
  }
  return { bold: cachedFontBoldBase64, regular: cachedFontRegularBase64, kalpurush: getKalpurushBase64() };
}

/* --- Language Detection --- */
function detectLanguage(text) {
  if (!text) return 'en';
  // Bengali Unicode range: U+0980 to U+09FF
  const bnMatches = (text.match(/[\u0980-\u09FF]/g) || []).length;
  const totalChars = text.replace(/\s+/g, '').length || 1;
  return (bnMatches / totalChars > 0.05 || bnMatches >= 2) ? 'bn' : 'en';
}

function isBengaliText(text) {
  return /[\u0980-\u09FF]/.test(String(text || ''));
}

/* --- HTML Strip Helper --- */
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/* --- Helper: Fetch URL to Buffer --- */
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'ChitronsArchive/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download image: HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => {
      req.destroy();
      reject(new Error('Image download timed out'));
    });
  });
}

/* =========================================================
   OPENROUTER AI HELPER
   ========================================================= */
async function callOpenRouter(messages, options = {}) {
  const apiKey = (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_key || '').trim();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is missing');
  }

  const model = options.model || 'google/gemini-2.0-flash-001';
  const siteUrl = process.env.FRONTEND_URL || 'https://chitron.iam.bd/';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': siteUrl,
      'X-Title': 'Chitrons Archive Editorial'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.5,
      max_tokens: options.maxTokens ?? 300
    })
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error?.message || `OpenRouter API error HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  return text.trim();
}

/* =========================================================
   1. AUTOMATIC EXCERPT GENERATION (OpenRouter SEO Priority)
   ========================================================= */
async function generateExcerpt(title, content, options = {}) {
  const rawText = stripHtml(content);
  if (!rawText) return title || 'No content summary available.';

  const category = options.category || '';
  const lang = detectLanguage(title + ' ' + rawText);

  // 1. Primary: Try OpenRouter AI Model for SEO-friendly, contextual excerpt
  const openRouterKey = (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_key || '').trim();
  if (openRouterKey) {
    try {
      const systemPrompt = lang === 'bn'
        ? 'আপনি একজন পেশাদার এসইও সম্পাদক এবং কন্টেন্ট বিশেষজ্ঞ। আপনার কাজ নিবন্ধের মূল ভাব বজায় রেখে সার্চ ইঞ্জিনের জন্য উপযুক্ত, অত্যন্ত বিষয়ভিত্তিক ও আকর্ষণীয় সারসংক্ষেপ তৈরি করা।'
        : 'You are an expert SEO editorial strategist. Your goal is to write a highly compelling, contextual, and SEO-friendly article excerpt/meta description.';

      const userPrompt = lang === 'bn'
        ? `নিচের নিবন্ধটির জন্য ১-২ বাক্যে (সর্বোচ্চ ২২-২৪০ অক্ষর) একটি আকর্ষণীয়, প্রাসঙ্গিক ও এসইও-বান্ধব সারসংক্ষেপ (excerpt/meta description) লিখুন। সারসংক্ষেপটি নিবন্ধের মূল বক্তব্য প্রকাশ করবে ও পাঠকের কৌতুহল জাগাবে। কোনো উদ্ধৃতি চিহ্ন, মার্কডাউন বা অতিরিক্ত ব্যাখ্যা ছাড়াই শুধুমাত্র তৈরি করা সারসংক্ষেপটি প্রদান করুন:\n\nশিরোনাম: ${title}\nক্যাটাগরি: ${category}\nলেখা: ${rawText.slice(0, 2500)}`
        : `Write a compelling, contextual, and SEO-optimized 1-2 sentence excerpt (meta description, max 220 characters) for the following article. Incorporate relevant context naturally, hook the reader, and summarize the key argument. Output ONLY the clean excerpt text without quotes, labels, or extra comments:\n\nTitle: ${title}\nCategory: ${category}\nContent: ${rawText.slice(0, 2500)}`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      const aiExcerpt = await callOpenRouter(messages, { temperature: 0.4, maxTokens: 250 });
      const cleanExcerpt = aiExcerpt.replace(/^["']|["']$/g, '').trim();

      if (cleanExcerpt && cleanExcerpt.length >= 20) {
        return cleanExcerpt;
      }
    } catch (err) {
      console.warn('[EditorialService] OpenRouter excerpt generation fallback:', err.message);
    }
  }

  // 2. Secondary: Fallback to Gemini AI if configured
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey && GoogleGenAI) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = lang === 'bn'
        ? `নিচের নিবন্ধটির জন্য ১-২ বাক্যে একটি সংক্ষিপ্ত, আকর্ষণীয় ও সঠিক সারসংক্ষেপ (excerpt) লিখুন। নিবন্ধটির মূল বিষয়টি বজায় রাখুন। কোনো অতিরিক্ত মন্তব্য করবেন না:\n\nশিরোনাম: ${title}\nলেখা: ${rawText.slice(0, 2000)}`
        : `Write a concise 1-2 sentence article excerpt/summary for the following text. Capture the main argument. Do not add metadata or extra commentary:\n\nTitle: ${title}\nContent: ${rawText.slice(0, 2000)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt
      });

      const aiText = response.text ? response.text.trim().replace(/^["']|["']$/g, '') : '';
      if (aiText && aiText.length >= 20) {
        return aiText;
      }
    } catch (err) {
      console.warn('[EditorialService] Gemini excerpt generation fallback:', err.message);
    }
  }

  // 3. Tertiary: Algorithmic Sentence Extraction Fallback
  const sentenceDelimiter = (lang === 'bn') ? /[।!?\n]+/ : /[.!?\n]+/;
  const sentences = rawText
    .split(sentenceDelimiter)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (sentences.length > 0) {
    let excerpt = sentences.slice(0, 2).join(lang === 'bn' ? '। ' : '. ');
    if (!excerpt.endsWith('।') && !excerpt.endsWith('.')) {
      excerpt += (lang === 'bn' ? '।' : '.');
    }
    if (excerpt.length > 280) {
      excerpt = excerpt.slice(0, 275) + '...';
    }
    return excerpt;
  }

  return rawText.slice(0, 200) + '...';
}

/* =========================================================
   2. AUTOMATIC TAG GENERATION
   ========================================================= */
async function generateTags(title, excerpt, content, category, options = {}) {
  const combinedText = `${title} ${excerpt || ''} ${stripHtml(content).slice(0, 1500)}`;
  const lang = detectLanguage(combinedText);

  // Try OpenRouter AI
  const openRouterKey = (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_key || '').trim();
  if (openRouterKey) {
    try {
      const userPrompt = lang === 'bn'
        ? `নিচের লেখাটির জন্য ৩ থেকে ৬টি প্রাসঙ্গিক ট্যাগ/লেবেল কমা দিয়ে পৃথক করে লিখুন (যেমন: মধ্যবিত্ত, অর্থনীতি, প্রযুক্তি, সমাজ)। শুধুমাত্র ট্যাগগুলো লিখুন:\n\nশিরোনাম: ${title}\nক্যাটাগরি: ${category || ''}\nলেখা: ${combinedText.slice(0, 1500)}`
        : `Generate 3 to 6 relevant short tags/labels separated by commas for this article. Output ONLY comma-separated tags:\n\nTitle: ${title}\nCategory: ${category || ''}\nContent: ${combinedText.slice(0, 1500)}`;

      const aiTags = await callOpenRouter([
        { role: 'system', content: 'You are an editorial taxonomy assistant. Output ONLY comma-separated tags.' },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.3, maxTokens: 100 });

      if (aiTags) {
        const parsed = aiTags
          .split(/[,;\n]+/)
          .map(t => t.replace(/^[#\-\s]+/, '').trim().toLowerCase())
          .filter(t => t.length > 1 && t.length < 30);
        if (parsed.length >= 2) {
          return [...new Set(parsed)].slice(0, 7);
        }
      }
    } catch (err) {
      console.warn('[EditorialService] OpenRouter tag generation fallback:', err.message);
    }
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey && GoogleGenAI) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = lang === 'bn'
        ? `নিচের লেখাটির জন্য ৩ থেকে ৬টি প্রাসঙ্গিক ট্যাগ/লেবেল কমা দিয়ে পৃথক করে লিখুন (যেমন: মধ্যবিত্ত, অর্থনীতি, শ্রেণিচেতনা, সমাজ)। শুধুমাত্র ট্যাগগুলো লিখুন:\n\nশিরোনাম: ${title}\nক্যাটাগরি: ${category || ''}\nলেখা: ${combinedText.slice(0, 1500)}`
        : `Generate 3 to 6 relevant short tags/labels separated by commas for this article. Output ONLY comma-separated tags:\n\nTitle: ${title}\nCategory: ${category || ''}\nContent: ${combinedText.slice(0, 1500)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt
      });

      const tagsRaw = response.text ? response.text.trim() : '';
      if (tagsRaw) {
        const parsed = tagsRaw
          .split(/[,;\n]+/)
          .map(t => t.replace(/^[#\-\s]+/, '').trim().toLowerCase())
          .filter(t => t.length > 1 && t.length < 30);
        if (parsed.length >= 2) {
          return [...new Set(parsed)].slice(0, 7);
        }
      }
    } catch (err) {
      console.warn('[EditorialService] Gemini tag generation fallback:', err.message);
    }
  }

  // Algorithmic Tag Extraction Fallback
  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'for', 'to', 'of', 'with', 'this', 'that', 'by', 'from',
    'এই', 'একটি', 'এবং', 'বা', 'জন্য', 'থেকে', 'করে', 'করা', 'হয়', 'হয়ে', 'হতে', 'তার', 'নিয়ে', 'আছে', 'না', 'কি', 'যে', 'এক', 'কে'
  ]);

  const words = combinedText
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));

  const freqMap = {};
  words.forEach(w => { freqMap[w] = (freqMap[w] || 0) + 1; });

  const sortedWords = Object.keys(freqMap).sort((a, b) => freqMap[b] - freqMap[a]);
  const tags = sortedWords.slice(0, 5);

  if (category && !tags.includes(category.toLowerCase())) {
    tags.unshift(category.toLowerCase());
  }

  return tags.length ? tags : ['general', 'reflections'];
}

/* =========================================================
   3. ARTICLE CONTENT PROMPT EXTRACTION FOR POLLINATIONS AI
   ========================================================= */
function buildPollinationsUrl(promptText) {
  const cleanPrompt = String(promptText || 'editorial minimalist workspace')
    .replace(/[\r\n]+/g, ' ')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?model=flux&width=1280&height=720&nologo=true`;
}

async function extractSearchKeywords(title, content, category) {
  const cleanContent = stripHtml(content || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  const cleanTitle = stripHtml(title || '').trim();
  const combined = `${cleanContent} ${cleanTitle} ${category || ''}`.trim();

  // Step 1: Try OpenRouter AI to generate a vivid visual prompt from content
  const openRouterKey = (process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_key || '').trim();
  if (openRouterKey && combined.length > 0) {
    try {
      const userPrompt = `Read the following article content (written in Bengali or English) and generate a concise, vivid English visual image prompt (6 to 14 words) suitable for Flux AI image generation. Describe the core subject, atmosphere, and editorial photography style without any text or logos in the image. Output ONLY the clean English prompt text without quotes or commentary:\n\nContent: ${cleanContent.slice(0, 2000)}\nTitle: ${cleanTitle}\nCategory: ${category || ''}`;

      const aiPrompt = await callOpenRouter([
        { role: 'system', content: 'You are an editorial art director. Output ONLY a single concise English visual image generation prompt.' },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.4, maxTokens: 80 });

      const cleaned = aiPrompt.replace(/^["']|["']$/g, '').replace(/[^\w\s,-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned && cleaned.length >= 5) {
        return cleaned.slice(0, 160);
      }
    } catch (err) {
      console.warn('[EditorialService] OpenRouter image prompt fallback:', err.message);
    }
  }

  // Step 2: Try Gemini AI if configured
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey && GoogleGenAI && combined.length > 0) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Read this article content and output ONLY a concise English visual image generation prompt (6 to 14 words, editorial photography style, no text in image) capturing the subject and mood:\n\nContent: ${cleanContent.slice(0, 2000)}\nTitle: ${cleanTitle}`;
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt
      });
      const aiText = response.text ? response.text.replace(/^["']|["']$/g, '').replace(/[^\w\s,-]/g, ' ').replace(/\s+/g, ' ').trim() : '';
      if (aiText && aiText.length >= 5) {
        return aiText.slice(0, 160);
      }
    } catch (err) {
      console.warn('[EditorialService] Gemini image prompt fallback:', err.message);
    }
  }

  // Step 3: Direct content analysis & Bengali/English concept mapping
  const conceptMap = [
    { regex: /মধ্যবিত্ত|class/i, keywords: 'middle class urban life city street editorial photography' },
    { regex: /শ্রেণি|শ্রমজীবী|labor|worker|কাজ/i, keywords: 'working class people documentary editorial photography' },
    { regex: /পুঁজিবাদ|অর্থনীতি|capitalism|economy|টাকা|বাজার/i, keywords: 'modern city economy skyline financial district cinematic' },
    { regex: /প্রযুক্তি|ai|artificial intelligence|code|software|কম্পিউটার|প্রোগ্রামিং|রোবট/i, keywords: 'modern artificial intelligence technology developer workspace glowing screen' },
    { regex: /লেখা|বই|writing|books|prose|সাহিত্য|কবিতা|ডায়েরি/i, keywords: 'vintage writing desk open book warm coffee lamp light' },
    { regex: /চিন্তা|ভাবনা|reflection|philosophy|মন|একাকীত্ব|নীরবতা/i, keywords: 'calm contemplative solitude atmospheric window light cinematic' },
    { regex: /সমাজ|রাজনীতি|society|politics|মানুষ|রাষ্ট্র/i, keywords: 'busy urban street life people atmospheric documentary photo' },
    { regex: /প্রকৃতি|নদী|আকাশ|বৃষ্টি|রাত|nature|sky|night|rain/i, keywords: 'serene nature twilight landscape dramatic sky reflection' },
    { regex: /শিক্ষা|বিজ্ঞান|গবেষণা|science|education|research/i, keywords: 'modern research study library desk books warm lighting' }
  ];

  const sourceForExtraction = cleanContent || cleanTitle;
  const matchedConcepts = [];
  for (const item of conceptMap) {
    if (item.regex.test(sourceForExtraction)) {
      matchedConcepts.push(item.keywords);
    }
  }

  // Extract meaningful words from the content itself
  const stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'for', 'to', 'of', 'with', 'this', 'that', 'by', 'from', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'but', 'not', 'or', 'as', 'it', 'its', 'into', 'about', 'can', 'will', 'just', 'more', 'some', 'other', 'than', 'then', 'now', 'only', 'very',
    'এই', 'একটি', 'এবং', 'বা', 'জন্য', 'থেকে', 'করে', 'করা', 'হয়', 'হয়ে', 'হতে', 'তার', 'নিয়ে', 'আছে', 'না', 'কি', 'যে', 'এক', 'কে', 'কোনো', 'কিন্তু', 'যখন', 'তখন', 'বলে', 'মধ্যে', 'সাথে', 'উপর', 'কাছে', 'পারে', 'যায়', 'দেয়'
  ]);

  const contentWords = sourceForExtraction
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !stopWords.has(w.toLowerCase()))
    .slice(0, 14);

  if (matchedConcepts.length > 0) {
    const englishFromContent = contentWords.filter(w => /^[a-zA-Z0-9-]+$/.test(w)).slice(0, 6).join(' ');
    const promptStr = `${englishFromContent ? englishFromContent + ' ' : ''}${matchedConcepts.slice(0, 2).join(', ')}`.trim();
    return promptStr.slice(0, 160);
  }

  if (contentWords.length > 0) {
    return `${contentWords.join(' ')} editorial photography cinematic lighting`.slice(0, 160);
  }

  return (cleanTitle || category || 'minimalist editorial writing workspace cinematic lighting').slice(0, 160);
}

/* =========================================================
   4. POLLINATIONS AI (FLUX) IMAGE GENERATION
   ========================================================= */
async function searchStockImage(searchQuery, category = '') {
  const promptText = (searchQuery || category || 'editorial writing desk workspace cinematic lighting').trim();
  const pollinationsUrl = buildPollinationsUrl(promptText);

  return {
    url: pollinationsUrl,
    provider: 'pollinations',
    providerImageId: `flux-${Date.now()}`,
    sourceUrl: pollinationsUrl,
    photographer: 'Pollinations AI (Flux)',
    photographerUrl: 'https://pollinations.ai',
    searchQuery: promptText
  };
}

/* =========================================================
   5. FEATURED IMAGE COMPOSITING (Pollinations AI + Title & Writer Overlay)
   ========================================================= */
function wrapCanvasText(ctx, text, maxWidth, maxLines = 3) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['Untitled Article'];

  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine + ' ' + word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines - 1) {
        const remaining = [currentLine, ...words.slice(i + 1)].join(' ');
        let truncated = remaining;
        while (ctx.measureText(truncated).width > maxWidth && truncated.length > 4) {
          truncated = truncated.slice(0, -2).trim() + '…';
        }
        lines.push(truncated);
        return lines;
      }
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.slice(0, maxLines);
}

async function downloadPollinationsBuffer(imageUrl) {
  if (!imageUrl) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 22000);
    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });
    clearTimeout(timer);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf && buf.length > 1000) return buf;
    }
  } catch (err) {
    // Fallback to fetchBuffer
  }
  try {
    const buf = await fetchBuffer(imageUrl);
    if (buf && buf.length > 1000) return buf;
  } catch (err) {
    console.warn('[EditorialService] Pollinations download warning:', err.message);
  }
  return null;
}

async function createFeaturedImage(stockPhotoObj, title, author = 'Chitron Bhattacharjee', slug = 'post') {
  const WIDTH = 1200;
  const HEIGHT = 630;
  const cleanTitle = stripHtml(title || 'Chitrons Archive').trim() || 'Chitrons Archive';
  const cleanAuthor = String(author || 'Chitron Bhattacharjee').trim();

  // Resolve Pollinations AI URL
  let sourceImageUrl = (stockPhotoObj && stockPhotoObj.url) ? stockPhotoObj.url : '';
  if (!sourceImageUrl) {
    const fallbackPrompt = await extractSearchKeywords(cleanTitle, '', '');
    sourceImageUrl = buildPollinationsUrl(fallbackPrompt);
  }

  // 1. Download Pollinations AI background image buffer (or generate fallback dark background)
  let baseImageBuffer = await downloadPollinationsBuffer(sourceImageUrl);
  let resizedBaseBuffer;

  if (baseImageBuffer) {
    try {
      resizedBaseBuffer = await sharp(baseImageBuffer)
        .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 92 })
        .toBuffer();
    } catch (e) {
      resizedBaseBuffer = null;
    }
  }

  if (!resizedBaseBuffer) {
    const bgCanvas = createCanvas(WIDTH, HEIGHT);
    const bgCtx = bgCanvas.getContext('2d');
    const bgGrad = bgCtx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.5, '#1e293b');
    bgGrad.addColorStop(1, '#090d16');
    bgCtx.fillStyle = bgGrad;
    bgCtx.fillRect(0, 0, WIDTH, HEIGHT);
    resizedBaseBuffer = bgCanvas.toBuffer('image/png');
  }

  // 2. Create @napi-rs/canvas overlay for dark gradient, blue bar, article title & writer name
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Left-to-right editorial dark gradient for crisp text contrast
  const horizGrad = ctx.createLinearGradient(0, 0, WIDTH, 0);
  horizGrad.addColorStop(0, 'rgba(10, 14, 24, 0.86)');
  horizGrad.addColorStop(0.55, 'rgba(10, 14, 24, 0.62)');
  horizGrad.addColorStop(1, 'rgba(10, 14, 24, 0.28)');
  ctx.fillStyle = horizGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Subtle bottom vignette
  const vertGrad = ctx.createLinearGradient(0, HEIGHT * 0.5, 0, HEIGHT);
  vertGrad.addColorStop(0, 'rgba(8, 12, 20, 0)');
  vertGrad.addColorStop(1, 'rgba(8, 12, 20, 0.60)');
  ctx.fillStyle = vertGrad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Configure typography for Bengali (Kalpurush) or English
  const hasBengali = isBengaliText(cleanTitle);
  const fontFamily = hasBengali
    ? '"Kalpurush", "NotoSerifBengali", sans-serif'
    : '"NotoSerifBengali", "Liberation Serif", Georgia, serif';

  let fontSize = 52;
  let lineHeight = 64;
  const maxTextWidth = 760;

  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  let lines = wrapCanvasText(ctx, cleanTitle, maxTextWidth, 3);

  if (lines.length >= 3) {
    fontSize = 46;
    lineHeight = 58;
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    lines = wrapCanvasText(ctx, cleanTitle, maxTextWidth, 3);
  }

  const totalTextHeight = lines.length * lineHeight;
  const barHeight = totalTextHeight + 8;
  const centerY = 310;
  const barY = Math.round(centerY - barHeight / 2);
  const barX = 50;
  const barWidth = 6;
  const textX = 76;

  // Draw vertical blue accent bar (#2262e6)
  ctx.save();
  ctx.fillStyle = '#2262e6';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(barX, barY, barWidth, barHeight, 3);
  } else {
    ctx.rect(barX, barY, barWidth, barHeight);
  }
  ctx.fill();
  ctx.restore();

  // Draw Article Title lines
  ctx.save();
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  for (let i = 0; i < lines.length; i++) {
    const lineY = barY + 4 + (i + 0.5) * lineHeight;
    ctx.fillText(lines[i], textX, lineY);
  }
  ctx.restore();

  // Draw Writer Name & Archive Attribution below title
  const authorLineText = `BY ${cleanAuthor.toUpperCase()} · CHITRONS ARCHIVE`;
  const authorY = barY + barHeight + 48;
  ctx.save();
  ctx.font = '600 15px "Liberation Serif", "NotoSerifBengaliRegular", Georgia, serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.80)';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 6;
  ctx.fillText(authorLineText, textX, authorY);
  ctx.restore();

  // Draw subtle bottom-right source credit
  const creditText = `Photo: ${(stockPhotoObj && stockPhotoObj.photographer) || 'Pollinations AI'} (${(stockPhotoObj && stockPhotoObj.provider) || 'flux'})`;
  ctx.save();
  ctx.font = '400 11px "Liberation Sans", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(creditText, WIDTH - 22, HEIGHT - 14);
  ctx.restore();

  const overlayBuffer = canvas.toBuffer('image/png');

  // 3. Composite overlay onto resized Pollinations AI image and save to /uploads/featured-images
  const safeSlug = String(slug || cleanTitle || 'post')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'post';

  const filename = `featured-${safeSlug}-${Date.now()}.jpg`;
  const outputPath = path.join(UPLOADS_DIR, filename);

  await sharp(resizedBaseBuffer)
    .composite([{ input: overlayBuffer, top: 0, left: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outputPath);

  return `/uploads/featured-images/${filename}`;
}

/* =========================================================
   6. MASTER PIPELINE ENRICHMENT FUNCTION
   ========================================================= */
async function enrichPostData(postData, automationSettings = {}) {
  const {
    autoExcerpt = true,
    autoTags = true,
    autoImage = true
  } = automationSettings;

  const result = {
    ...postData,
    editorialAutomation: postData.editorialAutomation || {
      enabled: true,
      excerpt: { source: 'manual' },
      tags: { source: 'manual' },
      featuredImage: { source: 'manual' }
    }
  };

  // 1. Automatic Excerpt
  if (!result.excerpt || result.excerpt.trim() === '') {
    if (autoExcerpt) {
      try {
        result.excerpt = await generateExcerpt(result.title, result.content, { category: result.category });
        result.editorialAutomation.excerpt = {
          source: 'generated',
          generatedAt: new Date()
        };
      } catch (err) {
        console.error('[EditorialService] Excerpt generation error:', err);
        result.excerpt = result.title || '';
      }
    } else {
      result.excerpt = result.title || '';
    }
  } else if (!result.editorialAutomation.excerpt.source) {
    result.editorialAutomation.excerpt = { source: 'manual' };
  }

  // 2. Automatic Tags
  if (!result.labels || !Array.isArray(result.labels) || result.labels.length === 0) {
    if (autoTags) {
      try {
        result.labels = await generateTags(result.title, result.excerpt, result.content, result.category);
        result.editorialAutomation.tags = {
          source: 'generated',
          generatedAt: new Date()
        };
      } catch (err) {
        console.error('[EditorialService] Tag generation error:', err);
        result.labels = ['reflections'];
      }
    } else {
      result.labels = ['reflections'];
    }
  } else if (!result.editorialAutomation.tags.source) {
    result.editorialAutomation.tags = { source: 'manual' };
  }

  // 3. Automatic Featured Image via Pollinations AI (Flux) + Article Title & Author Overlay
  const currentCover = (result.coverImage || '').trim();
  const isRawPollinationsUrl = currentCover.includes('image.pollinations.ai/prompt/');

  if (!currentCover || isRawPollinationsUrl) {
    if (autoImage || isRawPollinationsUrl) {
      try {
        let stockPhoto;
        if (isRawPollinationsUrl) {
          stockPhoto = {
            url: currentCover,
            provider: 'pollinations',
            providerImageId: `flux-${Date.now()}`,
            sourceUrl: currentCover,
            photographer: 'Pollinations AI (Flux)',
            photographerUrl: 'https://pollinations.ai',
            searchQuery: currentCover
          };
        } else {
          const searchQuery = await extractSearchKeywords(result.title, result.content, result.category);
          stockPhoto = await searchStockImage(searchQuery, result.category);
        }

        if (stockPhoto && stockPhoto.url) {
          const renderedPath = await createFeaturedImage(
            stockPhoto,
            result.title,
            result.author || 'Chitron Bhattacharjee',
            result.slug || 'post'
          );
          result.coverImage = renderedPath || stockPhoto.url;
          result.editorialAutomation.featuredImage = {
            source: 'pollinations',
            provider: stockPhoto.provider,
            providerImageId: stockPhoto.providerImageId,
            sourceUrl: stockPhoto.sourceUrl,
            photographer: stockPhoto.photographer,
            photographerUrl: stockPhoto.photographerUrl,
            searchQuery: stockPhoto.searchQuery,
            generatedAt: new Date()
          };
        }
      } catch (err) {
        console.error('[EditorialService] Pollinations image generation error:', err);
      }
    }
  } else if (!result.editorialAutomation.featuredImage.source) {
    result.editorialAutomation.featuredImage = { source: 'manual' };
  }

  return result;
}

module.exports = {
  detectLanguage,
  generateExcerpt,
  generateTags,
  extractSearchKeywords,
  buildPollinationsUrl,
  searchStockImage,
  createFeaturedImage,
  enrichPostData
};
