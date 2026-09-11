const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

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

/* --- Language Detection --- */
function detectLanguage(text) {
  if (!text) return 'en';
  // Bengali Unicode range: U+0980 to U+09FF
  const bnRegex = /[\u0980-\u09FF]/;
  const bnMatches = (text.match(/[\u0980-\u09FF]/g) || []).length;
  const totalChars = text.replace(/\s+/g, '').length || 1;
  return (bnMatches / totalChars > 0.1) ? 'bn' : 'en';
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
   1. AUTOMATIC EXCERPT GENERATION
   ========================================================= */
async function generateExcerpt(title, content, options = {}) {
  const rawText = stripHtml(content);
  if (!rawText) return title || 'No content summary available.';

  const lang = detectLanguage(title + ' ' + rawText);

  // Try Gemini AI if key exists
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey && GoogleGenAI) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = lang === 'bn'
        ? `নিচের নিবন্ধটির জন্য ১-২ বাক্যে একটি সংক্ষিপ্ত, আকর্ষণীয় ও সঠিক সারসংক্ষেপ (excerpt) লিখুন। নিবন্ধটির মূল বিষয়টি বজায় রাখুন। কোনো অতিরিক্ত মন্তব্য করবেন না:\n\nশিরোনাম: ${title}\nলেখা: ${rawText.slice(0, 2000)}`
        : `Write a concise 1-2 sentence article excerpt/summary for the following text. Capture the main argument. Do not add metadata or extra commentary:\n\nTitle: ${title}\nContent: ${rawText.slice(0, 2000)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
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

  // Pure Algorithmic Fallback (Bengali & English sentence boundaries)
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

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey && GoogleGenAI) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = lang === 'bn'
        ? `নিচের লেখাটির জন্য ৩ থেকে ৬টি প্রাসঙ্গিক ট্যাগ/লেবেল কমা দিয়ে পৃথক করে লিখুন (যেমন: মধ্যবিত্ত, অর্থনীতি, শ্রেণিচেতনা, সমাজ)। শুধুমাত্র ট্যাগগুলো লিখুন:\n\nশিরোনাম: ${title}\nক্যাটাগরি: ${category || ''}\nলেখা: ${combinedText.slice(0, 1500)}`
        : `Generate 3 to 6 relevant short tags/labels separated by commas for this article. Output ONLY comma-separated tags:\n\nTitle: ${title}\nCategory: ${category || ''}\nContent: ${combinedText.slice(0, 1500)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
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
   3. ARTICLE TOPIC UNDERSTANDING & SEARCH KEYWORDS
   ========================================================= */
function extractSearchKeywords(title, content, category) {
  const combined = `${title} ${category || ''} ${stripHtml(content).slice(0, 1000)}`;

  // Translation mapping for common Bengali political/economic/social terms to concrete stock keywords
  const conceptMap = [
    { regex: /মধ্যবিত্ত|class/i, keywords: 'middle class city workers' },
    { regex: /শ্রেণি|শ্রমজীবী|labor|worker|কাজ/i, keywords: 'working class people labor' },
    { regex: /পুঁজিবাদ|অর্থনীতি|capitalism|economy/i, keywords: 'city economy business office' },
    { regex: /প্রযুক্তি|ai|code|software|কম্পিউটার/i, keywords: 'technology computer workspace' },
    { regex: /লেখা|বই|writing|books|prose/i, keywords: 'writing desk book study cafe' },
    { regex: /চিন্তা|ভাবনা|reflection|philosophy/i, keywords: 'calm solitude portrait thinking' },
    { regex: /সমাজ|রাজনীতি|society|politics/i, keywords: 'urban street people city crowd' }
  ];

  let matchedKeywords = [];
  for (const item of conceptMap) {
    if (item.regex.test(combined)) {
      matchedKeywords.push(item.keywords);
    }
  }

  if (matchedKeywords.length > 0) {
    return matchedKeywords.join(' ').slice(0, 80);
  }

  // Default clean English visual keywords derived from English words or standard fallback
  const cleanEng = title.replace(/[^\w\s]/g, '').trim().split(/\s+/).filter(w => w.length > 3).join(' ');
  return cleanEng || 'editorial writing coffee workspace';
}

/* =========================================================
   4. AUTOMATIC STOCK IMAGE SEARCH (Pixabay + Pexels)
   ========================================================= */
async function searchStockImage(searchQuery) {
  const query = encodeURIComponent(searchQuery || 'writing desk workspace');

  // Provider 1: Pixabay
  const pixabayKey = process.env.PIXABAY_API_KEY || '23805988-518d6a782a201c13745ef2021'; // Public developer key fallback
  try {
    const pUrl = `https://pixabay.com/api/?key=${pixabayKey}&q=${query}&image_type=photo&orientation=horizontal&min_width=1280&per_page=10&safesearch=true`;
    const res = await fetchBuffer(pUrl);
    const data = JSON.parse(res.toString('utf-8'));

    if (data && data.hits && data.hits.length > 0) {
      // Score candidates: prefer landscape (webformatWidth > webformatHeight), high views/likes
      const candidates = data.hits.map(img => {
        const ratio = (img.imageWidth && img.imageHeight) ? img.imageWidth / img.imageHeight : 1.5;
        const isLandscape = ratio >= 1.2;
        const score = (isLandscape ? 100 : 0) + (img.likes || 0) + Math.min(50, (img.views || 0) / 100);
        return {
          score,
          url: img.largeImageURL || img.webformatURL,
          provider: 'pixabay',
          providerImageId: String(img.id),
          sourceUrl: img.pageURL,
          photographer: img.user || 'Pixabay Contributor',
          photographerUrl: `https://pixabay.com/users/${img.user}-${img.user_id}/`,
          searchQuery
        };
      });

      candidates.sort((a, b) => b.score - a.score);
      if (candidates[0]) {
        return candidates[0];
      }
    }
  } catch (err) {
    console.warn('[EditorialService] Pixabay search failed:', err.message);
  }

  // Provider 2: Pexels Fallback
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (pexelsKey) {
    try {
      const pexUrl = `https://api.pexels.com/v1/search?query=${query}&orientation=landscape&per_page=10`;
      const res = await new Promise((resolve, reject) => {
        const req = https.get(pexUrl, {
          headers: { 'Authorization': pexelsKey, 'User-Agent': 'ChitronsArchive/1.0' }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
      });

      if (res && res.photos && res.photos.length > 0) {
        const photo = res.photos[0];
        return {
          url: photo.src.large2x || photo.src.large || photo.src.original,
          provider: 'pexels',
          providerImageId: String(photo.id),
          sourceUrl: photo.url,
          photographer: photo.photographer,
          photographerUrl: photo.photographer_url,
          searchQuery
        };
      }
    } catch (err) {
      console.warn('[EditorialService] Pexels search failed:', err.message);
    }
  }

  // Final fallback curated editorial stock photos if search APIs have no match
  const fallbackCollection = [
    {
      url: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80',
      provider: 'unsplash',
      providerImageId: 'fallback-writing-desk',
      sourceUrl: 'https://unsplash.com/photos/writing-desk',
      photographer: 'Unsplash Community',
      photographerUrl: 'https://unsplash.com',
      searchQuery
    },
    {
      url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
      provider: 'unsplash',
      providerImageId: 'fallback-city-architecture',
      sourceUrl: 'https://unsplash.com',
      photographer: 'Unsplash Community',
      photographerUrl: 'https://unsplash.com',
      searchQuery
    }
  ];

  return fallbackCollection[Math.floor(Math.random() * fallbackCollection.length)];
}

/* =========================================================
   5. FEATURED IMAGE CREATION WITH TYPOGRAPHY OVERLAY
   ========================================================= */
function wrapText(text, maxCharsPerLine = 32) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.slice(0, 4); // Max 4 lines
}

function escapeXml(unsafe) {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function createFeaturedImage(stockPhotoObj, title, author = 'Chitron Bhattacharjee', slug = 'post') {
  if (!stockPhotoObj || !stockPhotoObj.url) {
    throw new Error('Valid stock photo URL required to generate featured image');
  }

  // 1. Download image buffer
  const imageBuffer = await fetchBuffer(stockPhotoObj.url);

  // 2. Base dimensions: standard 1200x630 (16:9 social share standard)
  const width = 1200;
  const height = 630;

  // 3. Prepare Title SVG Overlay with clean typography & contrast backdrop
  const titleLines = wrapText(title, 28);
  const titleFontSize = titleLines.length > 2 ? 42 : 48;
  const lineHeight = titleFontSize * 1.25;
  const startY = Math.max(160, Math.floor((height - (titleLines.length * lineHeight)) / 2) - 10);

  const titleTspans = titleLines.map((line, idx) => {
    return `<tspan x="80" y="${startY + (idx * lineHeight)}">${escapeXml(line)}</tspan>`;
  }).join('');

  const authorY = startY + (titleLines.length * lineHeight) + 40;
  const creditText = stockPhotoObj.photographer ? `Photo: ${stockPhotoObj.photographer} (${stockPhotoObj.provider})` : '';

  // SVG Overlay definition with dark gradient & glassmorphic text box
  const svgOverlay = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#090a0f" stop-opacity="0.45"/>
          <stop offset="50%" stop-color="#090a0f" stop-opacity="0.75"/>
          <stop offset="100%" stop-color="#090a0f" stop-opacity="0.92"/>
        </linearGradient>
      </defs>

      <!-- Vignette Overlay -->
      <rect width="${width}" height="${height}" fill="url(#vignette)"/>

      <!-- Editorial Accent Bar -->
      <rect x="50" y="${startY - 10}" width="6" height="${(titleLines.length * lineHeight) + 20}" fill="#2563eb" rx="3"/>

      <!-- Title Text -->
      <text font-family="'Hind Siliguri', 'Noto Sans Bengali', 'Plus Jakarta Sans', system-ui, sans-serif"
            font-size="${titleFontSize}px"
            font-weight="700"
            fill="#ffffff"
            letter-spacing="-0.02em">
        ${titleTspans}
      </text>

      <!-- Author Line -->
      <text x="80" y="${authorY}"
            font-family="'Plus Jakarta Sans', system-ui, sans-serif"
            font-size="22px"
            font-weight="600"
            fill="#94a3b8"
            letter-spacing="0.05em">
        BY ${escapeXml(author.toUpperCase())} &middot; CHITRONS ARCHIVE
      </text>

      <!-- Source Credit Tag -->
      <text x="${width - 40}" y="${height - 25}"
            text-anchor="end"
            font-family="system-ui, sans-serif"
            font-size="13px"
            fill="#64748b">
        ${escapeXml(creditText)}
      </text>
    </svg>
  `;

  // 4. Composite image using Sharp
  const filename = `featured-${slug}-${Date.now()}.jpg`;
  const outputPath = path.join(UPLOADS_DIR, filename);

  await sharp(imageBuffer)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .jpeg({ quality: 88, progressive: true })
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
        result.excerpt = await generateExcerpt(result.title, result.content);
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

  // 3. Automatic Featured Image
  if (!result.coverImage || result.coverImage.trim() === '') {
    if (autoImage) {
      try {
        const searchQuery = extractSearchKeywords(result.title, result.content, result.category);
        const stockPhoto = await searchStockImage(searchQuery);

        if (stockPhoto) {
          const featuredImgUrl = await createFeaturedImage(stockPhoto, result.title, result.author || 'Chitron Bhattacharjee', result.slug || 'post');
          result.coverImage = featuredImgUrl;
          result.editorialAutomation.featuredImage = {
            source: 'stock',
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
        console.error('[EditorialService] Stock photo & featured image creation error:', err);
        // Do NOT fail the post creation if stock photo fails!
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
  searchStockImage,
  createFeaturedImage,
  enrichPostData
};
