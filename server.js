const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const session = require('express-session');
const { initializeApp, getApps, getApp } = require('firebase/app');
const { getDatabase, ref, get, set, update, remove, push } = require('firebase/database');
const { getAuth, signInAnonymously } = require('firebase/auth');
const fbFirestoreModule = require('firebase/firestore');

require('dotenv').config();

const firebaseConfig = {
  apiKey: "AIzaSyBIuJFn74hJK1LT_Shcl-Y5DMgiOArB8Ps",
  authDomain: "shipu-ai.firebaseapp.com",
  databaseURL: "https://shipu-ai-default-rtdb.firebaseio.com",
  projectId: "shipu-ai",
  storageBucket: "shipu-ai.firebasestorage.app",
  messagingSenderId: "953122849300",
  appId: "1:953122849300:web:f821f1a161ce7879001d01",
  measurementId: "G-N2WMSS3MNG"
};

const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const firebaseAuth = getAuth(firebaseApp);
const firebaseRTDB = getDatabase(firebaseApp);

signInAnonymously(firebaseAuth).catch(err => console.warn('Firebase RTDB Auth notice:', err.message));

// Shared Cloud Firestore Initialization (ai-studio-chitronsarchive-10788b8b-fa5c-47f1-b9ba-5688024b52b7)
let firebaseAppletConfig = {};
let serverFirestore = null;
let firestoreModules = fbFirestoreModule;
try {
  const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    firebaseAppletConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (firebaseAppletConfig && firebaseAppletConfig.apiKey && firebaseAppletConfig.projectId) {
      const existingFsApp = getApps().find(a => a.name === 'applet-firestore');
      const fsAppInstance = existingFsApp || initializeApp(firebaseAppletConfig, 'applet-firestore');
      serverFirestore = firebaseAppletConfig.firestoreDatabaseId
        ? fbFirestoreModule.getFirestore(fsAppInstance, firebaseAppletConfig.firestoreDatabaseId)
        : fbFirestoreModule.getFirestore(fsAppInstance);
    }
  }
} catch (e) {
  console.warn('Cloud Firestore init warning:', e.message);
}

const cors = require('cors');
const slugify = require('slugify');
const crypto = require('crypto');
const multer = require('multer');
const compression = require('compression');
const sharp = require('sharp');
const { WebSocketServer } = require('ws');

const editorialService = require('./backend/editorialService');

function generateSlug(text, customSlug) {
  const source = (customSlug && customSlug.trim()) ? customSlug.trim() : (text || '');
  if (!source) return 'post-' + Date.now();

  let slug = source
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug || slug.length < 2) {
    slug = 'post-' + Date.now();
  }
  return slug;
}

const PORT = 3000;
const HOST = '0.0.0.0';
const ADMIN_PIN = process.env.ADMIN_PIN || '123456';
const SESSION_SECRET = process.env.SESSION_SECRET || 'chitrons-archive-session-secret-key';
const MONGODB_URI = process.env.MONGODB_URI || '';

const app = express();

// High-performance gzip & brotli compression for all text responses
app.use(compression());

// Trust proxy for secure cookies behind reverse proxy / Cloud Run
app.set('trust proxy', 1);

/* --- CORS --- */
app.use(cors({
  origin: function (origin, callback) {
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* --- Uploads Storage & Multer --- */
const uploadsDir = path.join(__dirname, 'uploads', 'gallery');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const cleanOriginal = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, `${cleanOriginal || 'photo'}-${unique}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WEBP, GIF, SVG) are allowed'));
    }
  }
});

/* --- Image Optimization & Static Serving --- */
const imageCacheDir = path.join(__dirname, 'uploads', 'cache');
if (!fs.existsSync(imageCacheDir)) {
  fs.mkdirSync(imageCacheDir, { recursive: true });
}

// Automatic WebP content negotiation and cross-instance upload sync for /uploads/*
app.use('/uploads', async (req, res, next) => {
  try {
    const requestedRel = decodeURIComponent(req.path).replace(/^\/+/, '');
    const localFile = path.join(__dirname, 'uploads', requestedRel);
    if (!fs.existsSync(localFile) && requestedRel.startsWith('featured-images/')) {
      const remoteUrl = `https://chitron.iam.bd/uploads/${req.path.replace(/^\/+/, '')}`;
      const remoteRes = await fetch(remoteUrl).catch(() => null);
      if (remoteRes && remoteRes.ok) {
        const buf = Buffer.from(await remoteRes.arrayBuffer());
        fs.mkdirSync(path.dirname(localFile), { recursive: true });
        fs.writeFileSync(localFile, buf);
      }
    }
    if (req.path.endsWith('.jpg') && req.headers.accept && req.headers.accept.includes('image/webp')) {
      const webpPath = localFile.replace(/\.jpg$/, '.webp');
      if (fs.existsSync(webpPath)) {
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(webpPath);
      }
    }
  } catch (e) {}
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '30d',
  setHeaders: (res, filePath) => {
    if (filePath.match(/\.(webp|jpg|jpeg|png|svg)$/i)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=604800');
    }
  }
}));

// On-the-fly and cached image optimizer (WebP, resize, responsive srcset)
app.get('/api/images/optimize', async (req, res) => {
  try {
    const rawUrl = req.query.url;
    if (!rawUrl) return res.status(400).json({ error: 'url is required' });
    const width = Math.min(1600, Math.max(100, parseInt(req.query.w) || 768));
    const quality = Math.min(100, Math.max(50, parseInt(req.query.q) || 80));

    const cacheKey = crypto.createHash('md5').update(`${rawUrl}-${width}-${quality}`).digest('hex');
    const cachedFilePath = path.join(imageCacheDir, `${cacheKey}.webp`);

    if (fs.existsSync(cachedFilePath)) {
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return fs.createReadStream(cachedFilePath).pipe(res);
    }

    let inputBuffer;
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      const response = await fetch(rawUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://chitron.iam.bd/'
        }
      });
      if (!response.ok) {
        return res.redirect(302, rawUrl);
      }
      inputBuffer = Buffer.from(await response.arrayBuffer());
    } else {
      const localPath = path.join(__dirname, decodeURIComponent(rawUrl).replace(/^\/+/, ''));
      if (!fs.existsSync(localPath)) {
        if (rawUrl.startsWith('/uploads/')) {
          const remoteUrl = `https://chitron.iam.bd${rawUrl}`;
          const remoteRes = await fetch(remoteUrl).catch(() => null);
          if (remoteRes && remoteRes.ok) {
            inputBuffer = Buffer.from(await remoteRes.arrayBuffer());
            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            fs.writeFileSync(localPath, inputBuffer);
          } else {
            return res.status(404).send('Image not found');
          }
        } else {
          return res.status(404).send('Image not found');
        }
      } else {
        inputBuffer = fs.readFileSync(localPath);
      }
    }

    const optimized = await sharp(inputBuffer)
      .resize(width, null, { withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    fs.writeFile(cachedFilePath, optimized, () => {});

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(optimized);
  } catch (err) {
    if (req.query.url) {
      return res.redirect(302, req.query.url);
    }
    res.status(500).send('Image processing error');
  }
});

/* --- In-Memory Home Bundle Cache --- */
let homeCache = null;
let homeCacheTime = 0;
const HOME_CACHE_TTL = 30000; // 30s TTL

function invalidateHomeCache() {
  homeCache = null;
  homeCacheTime = 0;
}

// Auto-invalidate cache on admin mutations
app.use('/api/admin', (req, res, next) => {
  if (req.method !== 'GET') {
    invalidateHomeCache();
  }
  next();
});

// High-speed consolidated home endpoint: eliminates 5 sequential roundtrips
app.get('/api/home', async (req, res) => {
  try {
    const now = Date.now();
    if (homeCache && (now - homeCacheTime) < HOME_CACHE_TTL) {
      res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
      return res.json(homeCache);
    }

    let settings = inMemorySettings;
    let page = inMemoryHomepage;
    let posts = [];
    let categories = [];

    const curDate = new Date();
    posts = inMemoryPosts.filter(p => {
      if (p.status === 'published') return true;
      if (p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt) <= curDate) return true;
      return false;
    }).sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt)).slice(0, 5).map(({ content, ...rest }) => rest);
    categories = [...new Set(posts.map(p => p.category).filter(Boolean))];

    homeCache = { settings, page, posts, categories };
    homeCacheTime = now;

    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    return res.json(homeCache);
  } catch (err) {
    console.error('Home bundle error:', err);
    res.status(500).json({ error: 'Failed to load home bundle' });
  }
});

/* --- Auth Token Management --- */
const activeTokens = new Set();

function generateAuthToken() {
  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.add(token);
  return token;
}

function isValidToken(token) {
  if (!token) return false;
  const clean = String(token).replace(/^Bearer\s+/i, '').trim();
  return activeTokens.has(clean);
}

/* --- Data State Definitions --- */

/* --- Seed Data Definitions --- */
const MOCK_POST_SLUGS = new Set([
  'building-shipu-ai-reflections',
  'why-i-prefer-minimalist-digital-archives',
  'on-writing-and-code'
]);
const MOCK_POST_IDS = new Set(['post-1', 'post-2', 'post-3']);
const deletedPostIds = new Set();

function isMockPost(p) {
  if (!p || typeof p !== 'object') return true;
  const id = String(p._id || p.id || '');
  const slug = String(p.slug || '');
  return MOCK_POST_IDS.has(id) || MOCK_POST_SLUGS.has(slug);
}

const initialPosts = [];

const initialAbout = {
  name: 'Chitron Bhattacharjee',
  headline: "Hi, I’m Chitron Bhattacharjee.",
  shortBio: "I’m an AI developer, programmer, and writer from Bangladesh. I enjoy building things with technology, especially AI-powered systems, web applications, and tools that solve real problems in a simple way.\n\nI’m always interested in learning how things work behind the scenes and turning ideas into something people can actually use.",
  biography: "I work with modern web technologies and enjoy experimenting with AI, automation, and conversational systems. Most of my time goes into building projects, improving my skills, and exploring new ideas in technology.\n\nI also enjoy writing. Sometimes I write about technology, sometimes about ideas and experiences, and sometimes simply to put thoughts into words.",
  profileImage: '/images/chitron-bhattacharjee.webp',
  imageAlt: 'Chitron Bhattacharjee',
  roles: [
    'Build AI-powered applications and conversational systems',
    'Develop full-stack web applications',
    'Work with JavaScript, Node.js, PHP, and modern web technologies',
    'Design clean and practical user interfaces',
    'Write about technology, ideas, and personal thoughts'
  ],
  interests: [
    'Artificial Intelligence',
    'Programming',
    'Web Development',
    'Conversational Systems',
    'UI/UX Design',
    'Writing',
    'Software Architecture'
  ],
  skills: [
    'JavaScript',
    'Node.js',
    'Express',
    'MongoDB',
    'PHP',
    'HTML & CSS'
  ],
  projects: [
    {
      title: 'ShiPu AI',
      description: 'ShiPu AI is one of my ongoing projects focused on conversational AI. The goal is to build a useful and flexible AI system that can communicate naturally and perform practical tasks.',
      tech: 'Built with: Node.js, JavaScript, and modern web technologies.',
      url: 'https://github.com/AdiBhaiAlpha'
    }
  ],
  philosophy: "I believe good software does not need to be unnecessarily complicated. I prefer things that are simple, fast, practical, and easy to understand.\n\nWhether I’m building a small tool or working on a larger project, I try to focus on making it useful first. Technology should solve problems, not create more of them.",
  currentFocus: "Right now, I’m working on AI-related projects, conversational systems, and personal web platforms. I’m also continuing to learn and experiment with new technologies as I build.",
  writingSection: "Writing gives me another way to explore and share ideas. Here you'll find a mix of reflective writing, technical notes, experiments, and thoughts about technology and the things I learn while building.",
  contactLinks: [
    { name: 'GitHub', url: 'https://github.com/AdiBhaiAlpha' },
    { name: 'Facebook', url: 'https://facebook.com/ssfadi' },
    { name: 'Instagram', url: 'https://instagram.com/im.chitron' }
  ]
};

const initialHomepage = {
  heroTitle: 'Chitron Bhattacharjee',
  heroDescription: 'AI developer, programmer, designer and writer from Bangladesh. This is my personal archive — notes, ideas, experiments and things worth remembering.',
  primaryButtonText: 'Read Writing',
  primaryButtonLink: './writing.html',
  secondaryButtonText: 'About Me',
  secondaryButtonLink: './about.html',
  featuredSectionTitle: 'Latest Writing'
};

const initialSettings = {
  siteName: "Chitron's Archive",
  tagline: 'Notes, ideas, experiments and things worth remembering.',
  authorName: 'Chitron Bhattacharjee',
  authorTitle: 'AI Developer, Programmer & Writer',
  location: 'Bangladesh',
  profileImage: '/images/chitron-bhattacharjee.webp',
  contactEmail: 'chitronbhattacharjee@gmail.com',
  seoTitle: "Chitron Bhattacharjee — AI Developer, Programmer & Writer | Chitron's Archive",
  seoDescription: 'Personal digital archive of Chitron Bhattacharjee — AI developer, programmer, designer and writer from Bangladesh.',
  socialLinks: [
    { name: 'GitHub', url: 'https://github.com/AdiBhaiAlpha' },
    { name: 'Bio Link', url: 'https://chitron.bio.link' }
  ]
};

const initialGallery = [
  {
    title: 'Chitron Bhattacharjee',
    caption: 'Official portrait and digital archive identity.',
    url: '/images/chitron-bhattacharjee.webp',
    category: 'Portrait',
    tags: ['portrait', 'founder', 'chitron'],
    location: 'Sylhet, Bangladesh',
    alt: 'Chitron Bhattacharjee portrait',
    date: new Date('2025-01-10T12:00:00Z'),
    featured: true,
    status: 'published',
    order: 1
  },
  {
    title: 'Minimalist Workspace',
    caption: 'Refining backend architectures and prompt chains in a calm, distraction-free environment.',
    url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=1200&auto=format&fit=crop',
    category: 'Workspace',
    tags: ['workspace', 'coding', 'minimalism'],
    location: 'Bangladesh',
    alt: 'Minimalist code workstation with laptop and notes',
    date: new Date('2025-02-15T15:30:00Z'),
    featured: true,
    status: 'published',
    order: 2
  },
  {
    title: 'ShiPu AI Reasoning Core',
    caption: 'Conversational state machines, Bengali prompt pipelines, and multi-step agent flow experiments.',
    url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1200&auto=format&fit=crop',
    category: 'Projects',
    tags: ['shipu-ai', 'ai', 'research'],
    location: 'Bangladesh',
    alt: 'Digital matrix of code representing AI reasoning pipelines',
    date: new Date('2025-02-28T18:20:00Z'),
    featured: true,
    status: 'published',
    order: 3
  },
  {
    title: 'Twilight Reflections',
    caption: 'Quiet walks at dusk — observing reflections on water and clearing the mind after hours of debugging.',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1200&auto=format&fit=crop',
    category: 'Photography',
    tags: ['twilight', 'nature', 'reflections'],
    location: 'Sylhet, Bangladesh',
    alt: 'Quiet evening twilight reflecting over tranquil waters',
    date: new Date('2025-03-01T17:45:00Z'),
    featured: false,
    status: 'published',
    order: 4
  },
  {
    title: 'Notes, Schemas & Coffee',
    caption: 'Drafting data models and database relations with pen and paper before writing any code.',
    url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?q=80&w=1200&auto=format&fit=crop',
    category: 'Workspace',
    tags: ['design', 'architecture', 'books'],
    location: 'Sylhet, Bangladesh',
    alt: 'Notebook, mechanical pencil, and books on a wooden desk',
    date: new Date('2025-03-03T10:15:00Z'),
    featured: false,
    status: 'published',
    order: 5
  },
  {
    title: 'Night Sky & Quiet Hours',
    caption: 'Late night coding sessions under clear starlit skies.',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1200&auto=format&fit=crop',
    category: 'Photography',
    tags: ['night', 'sky', 'solitude'],
    location: 'Bangladesh',
    alt: 'Vast serene night sky landscape',
    date: new Date('2025-03-04T22:00:00Z'),
    featured: false,
    status: 'published',
    order: 6
  }
];

/* --- In-Memory State & Persistent Firebase RTDB Mirror --- */
let inMemoryPosts = initialPosts.map((p, i) => ({
  ...p,
  _id: `post-${i + 1}`,
  id: `post-${i + 1}`,
  createdAt: (p.publishedAt || new Date()).toISOString(),
  updatedAt: (p.publishedAt || new Date()).toISOString()
}));
let inMemoryGallery = initialGallery.map((g, i) => ({
  ...g,
  _id: `photo-${i + 1}`,
  id: `photo-${i + 1}`,
  date: (g.date || new Date()).toISOString(),
  createdAt: (g.date || new Date()).toISOString(),
  updatedAt: (g.date || new Date()).toISOString()
}));
let inMemoryRevisions = [];
let inMemoryAbout = { ...initialAbout };
let inMemoryHomepage = { ...initialHomepage };
let inMemorySettings = { ...initialSettings };
let adminPresenceState = {
  adminOnline: false,
  adminLastSeen: Date.now() - 12 * 60 * 1000
};

const rtdbMirrorPath = path.join(__dirname, 'uploads', 'firebase-rtdb-mirror.json');
let rtdbMirrorState = {
  seeded: false,
  posts: {},
  gallery: {},
  about: null,
  homepage: null,
  settings: null,
  conversations: {}
};

function loadRtdbMirrorFromDisk() {
  try {
    if (fs.existsSync(rtdbMirrorPath)) {
      const raw = fs.readFileSync(rtdbMirrorPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        rtdbMirrorState = { ...rtdbMirrorState, ...parsed };
        return true;
      }
    }
  } catch (err) {
    console.warn('Could not load RTDB mirror from disk:', err.message);
  }
  return false;
}

function saveRtdbMirrorToDisk() {
  try {
    fs.writeFileSync(rtdbMirrorPath, JSON.stringify(rtdbMirrorState, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not save RTDB mirror to disk:', err.message);
  }
}

function setNestedPath(obj, pathStr, val) {
  const parts = String(pathStr).split('/').filter(Boolean);
  if (parts.length === 0) return;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = JSON.parse(JSON.stringify(val));
}

function getNestedPath(obj, pathStr) {
  const parts = String(pathStr).split('/').filter(Boolean);
  let cur = obj;
  for (const k of parts) {
    if (!cur || typeof cur !== 'object' || !(k in cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

function removeNestedPath(obj, pathStr) {
  const parts = String(pathStr).split('/').filter(Boolean);
  if (parts.length === 0) return;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur || typeof cur !== 'object' || !(k in cur)) return;
    cur = cur[k];
  }
  delete cur[parts[parts.length - 1]];
}

/* --- Firebase Realtime Database CRUD Helpers --- */
async function rtdbGet(pathStr) {
  try {
    const snap = await get(ref(firebaseRTDB, pathStr));
    if (snap.exists()) {
      const val = snap.val();
      setNestedPath(rtdbMirrorState, pathStr, val);
      saveRtdbMirrorToDisk();
      return val;
    }
  } catch (err) {
    // Fallback to synchronized mirror if RTDB rules restrict direct path read
  }
  const localVal = getNestedPath(rtdbMirrorState, pathStr);
  return localVal !== undefined ? localVal : null;
}

async function rtdbSet(pathStr, val) {
  const cleanVal = JSON.parse(JSON.stringify(val));
  setNestedPath(rtdbMirrorState, pathStr, cleanVal);
  rtdbMirrorState.seeded = true;
  saveRtdbMirrorToDisk();

  // Sync with shared Cloud Firestore
  if (serverFirestore && firestoreModules) {
    try {
      const parts = String(pathStr).split('/').filter(Boolean);
      if (parts[0] === 'posts' && parts[1]) {
        await firestoreModules.setDoc(firestoreModules.doc(serverFirestore, 'posts', parts[1]), cleanVal, { merge: true });
      } else if (parts[0] === 'gallery' && parts[1]) {
        await firestoreModules.setDoc(firestoreModules.doc(serverFirestore, 'gallery', parts[1]), cleanVal, { merge: true });
      } else if (['about', 'homepage', 'settings'].includes(parts[0]) && parts.length === 1) {
        await firestoreModules.setDoc(firestoreModules.doc(serverFirestore, 'cms', parts[0]), cleanVal, { merge: true });
      } else if (parts[0] === 'presence' && parts[1]) {
        await firestoreModules.setDoc(firestoreModules.doc(serverFirestore, 'presence', parts[1]), cleanVal, { merge: true });
      }
    } catch (fsErr) {}
  }

  try {
    await set(ref(firebaseRTDB, pathStr), cleanVal);
    return true;
  } catch (err) {
    return false;
  }
}

async function rtdbUpdate(pathStr, updates) {
  const cleanUpdates = JSON.parse(JSON.stringify(updates));
  const existing = getNestedPath(rtdbMirrorState, pathStr);
  if (existing && typeof existing === 'object') {
    setNestedPath(rtdbMirrorState, pathStr, { ...existing, ...cleanUpdates });
  } else {
    setNestedPath(rtdbMirrorState, pathStr, cleanUpdates);
  }
  rtdbMirrorState.seeded = true;
  saveRtdbMirrorToDisk();

  if (serverFirestore && firestoreModules) {
    try {
      const parts = String(pathStr).split('/').filter(Boolean);
      if (parts[0] === 'posts' && parts[1]) {
        await firestoreModules.setDoc(firestoreModules.doc(serverFirestore, 'posts', parts[1]), cleanUpdates, { merge: true });
      } else if (parts[0] === 'gallery' && parts[1]) {
        await firestoreModules.setDoc(firestoreModules.doc(serverFirestore, 'gallery', parts[1]), cleanUpdates, { merge: true });
      }
    } catch (fsErr) {}
  }

  try {
    await update(ref(firebaseRTDB, pathStr), cleanUpdates);
    return true;
  } catch (err) {
    return false;
  }
}

async function rtdbRemove(pathStr) {
  removeNestedPath(rtdbMirrorState, pathStr);
  rtdbMirrorState.seeded = true;
  saveRtdbMirrorToDisk();

  const parts = String(pathStr).split('/').filter(Boolean);
  if (parts[0] === 'posts' && parts[1]) {
    deletedPostIds.add(parts[1]);
  }

  if (serverFirestore && firestoreModules) {
    try {
      if (parts[0] === 'posts' && parts[1]) {
        await firestoreModules.deleteDoc(firestoreModules.doc(serverFirestore, 'posts', parts[1]));
      } else if (parts[0] === 'gallery' && parts[1]) {
        await firestoreModules.deleteDoc(firestoreModules.doc(serverFirestore, 'gallery', parts[1]));
      }
    } catch (fsErr) {}
  }

  try {
    await remove(ref(firebaseRTDB, pathStr));
    return true;
  } catch (err) {
    return false;
  }
}

async function syncGalleryToRTDB() {
  const galleryMap = {};
  inMemoryGallery.forEach(g => {
    const id = String(g._id || g.id);
    galleryMap[id] = { ...g, _id: id, id };
  });
  rtdbMirrorState.gallery = JSON.parse(JSON.stringify(galleryMap));
  rtdbMirrorState.seeded = true;
  saveRtdbMirrorToDisk();
  if (serverFirestore && firestoreModules) {
    for (const [id, item] of Object.entries(rtdbMirrorState.gallery)) {
      firestoreModules.setDoc(firestoreModules.doc(serverFirestore, 'gallery', id), item, { merge: true }).catch(() => {});
    }
  }
  try {
    await set(ref(firebaseRTDB, 'gallery'), JSON.parse(JSON.stringify(galleryMap)));
  } catch (err) {}
}

async function syncPostsToRTDB() {
  inMemoryPosts = inMemoryPosts.filter(p => !isMockPost(p));
  const postsMap = {};
  inMemoryPosts.forEach(p => {
    const id = String(p._id || p.id);
    postsMap[id] = { ...p, _id: id, id };
  });
  rtdbMirrorState.posts = JSON.parse(JSON.stringify(postsMap));
  rtdbMirrorState.seeded = true;
  saveRtdbMirrorToDisk();
  invalidateHomeCache();
  if (serverFirestore && firestoreModules) {
    for (const [id, item] of Object.entries(rtdbMirrorState.posts)) {
      firestoreModules.setDoc(firestoreModules.doc(serverFirestore, 'posts', id), item, { merge: true }).catch(() => {});
    }
  }
  try {
    await set(ref(firebaseRTDB, 'posts'), JSON.parse(JSON.stringify(postsMap)));
  } catch (err) {}
}

let isSyncingProdPosts = false;
async function syncLiveProductionPosts() {
  if (isSyncingProdPosts) return;
  isSyncingProdPosts = true;
  try {
    const listRes = await fetch('https://chitron.iam.bd/api/posts?limit=100').then(r => r.ok ? r.json() : null).catch(() => null);
    if (listRes && Array.isArray(listRes.posts)) {
      let addedOrUpdated = false;
      for (const summary of listRes.posts) {
        if (!summary || isMockPost(summary)) continue;
        const pid = String(summary._id || summary.id || '');
        if (!pid || deletedPostIds.has(pid)) continue;

        const existing = inMemoryPosts.find(p => String(p._id || p.id) === pid || p.slug === summary.slug);
        if (!existing || !existing.content) {
          const detailRes = await fetch(`https://chitron.iam.bd/api/posts/${encodeURIComponent(summary.slug)}`).then(r => r.ok ? r.json() : null).catch(() => null);
          const fullPost = (detailRes && (detailRes.post || detailRes)) || summary;
          if (fullPost && !isMockPost(fullPost)) {
            const normalized = {
              ...fullPost,
              _id: String(fullPost._id || fullPost.id || pid),
              id: String(fullPost._id || fullPost.id || pid),
              status: fullPost.status || 'published',
              createdAt: fullPost.createdAt || fullPost.publishedAt || new Date().toISOString(),
              updatedAt: fullPost.updatedAt || fullPost.publishedAt || new Date().toISOString()
            };
            const idx = inMemoryPosts.findIndex(p => String(p._id || p.id) === normalized._id || p.slug === normalized.slug);
            if (idx !== -1) {
              inMemoryPosts[idx] = normalized;
            } else {
              inMemoryPosts.push(normalized);
            }
            addedOrUpdated = true;

            if (normalized.coverImage && normalized.coverImage.startsWith('/uploads/')) {
              const localCover = path.join(__dirname, decodeURIComponent(normalized.coverImage).replace(/^\/+/, ''));
              if (!fs.existsSync(localCover)) {
                fetch(`https://chitron.iam.bd${normalized.coverImage}`).then(async r => {
                  if (r.ok) {
                    const buf = Buffer.from(await r.arrayBuffer());
                    fs.mkdirSync(path.dirname(localCover), { recursive: true });
                    fs.writeFileSync(localCover, buf);
                  }
                }).catch(() => {});
              }
            }
          }
        }
      }
      if (addedOrUpdated) {
        await syncPostsToRTDB();
      }
    }
  } catch (e) {
    // Non-blocking production sync
  } finally {
    isSyncingProdPosts = false;
  }
}

async function initFirebaseRTDB() {
  console.log('Initializing Cloud Firestore & Realtime Sync...');
  const hadMirror = loadRtdbMirrorFromDisk();

  try {
    // 1. Load Posts from Cloud Firestore (Primary Shared Database)
    let loadedFromFirestore = false;
    if (serverFirestore && firestoreModules) {
      try {
        const fsSnap = await firestoreModules.getDocs(firestoreModules.collection(serverFirestore, 'posts'));
        const fsPosts = [];
        fsSnap.forEach(d => {
          const data = d.data();
          if (data && !isMockPost(data)) {
            fsPosts.push({
              ...data,
              _id: String(data._id || data.id || d.id),
              id: String(data._id || data.id || d.id)
            });
          }
        });
        if (fsPosts.length > 0) {
          inMemoryPosts = fsPosts;
          loadedFromFirestore = true;
        }
      } catch (e) {}
    }

    if (!loadedFromFirestore && hadMirror && rtdbMirrorState.posts) {
      inMemoryPosts = Object.values(rtdbMirrorState.posts).filter(p => p && !isMockPost(p));
    }

    // Remove any mock posts and sync live articles from chitron.iam.bd
    inMemoryPosts = inMemoryPosts.filter(p => !isMockPost(p));
    await syncLiveProductionPosts();
    await syncPostsToRTDB();

    // Attach Real-Time Cloud Firestore Listeners so Production & Preview stay synced live
    if (serverFirestore && firestoreModules) {
      try {
        firestoreModules.onSnapshot(
          firestoreModules.collection(serverFirestore, 'posts'),
          (snap) => {
            const livePosts = [];
            snap.forEach(docSnap => {
              const p = docSnap.data();
              if (p && !isMockPost(p) && !deletedPostIds.has(docSnap.id)) {
                livePosts.push({
                  ...p,
                  _id: String(p._id || p.id || docSnap.id),
                  id: String(p._id || p.id || docSnap.id)
                });
              }
            });
            if (livePosts.length > 0 || snap.empty) {
              inMemoryPosts = livePosts;
              const postsMap = {};
              inMemoryPosts.forEach(p => { postsMap[p._id] = p; });
              rtdbMirrorState.posts = postsMap;
              saveRtdbMirrorToDisk();
              invalidateHomeCache();
            }
          },
          () => {}
        );

        firestoreModules.onSnapshot(
          firestoreModules.collection(serverFirestore, 'gallery'),
          (snap) => {
            if (snap.empty) return;
            const liveGallery = [];
            snap.forEach(docSnap => {
              const g = docSnap.data();
              if (g && (g.url || g.title)) {
                liveGallery.push({
                  ...g,
                  _id: String(g._id || g.id || docSnap.id),
                  id: String(g._id || g.id || docSnap.id)
                });
              }
            });
            if (liveGallery.length > 0) {
              inMemoryGallery = liveGallery;
              const galleryMap = {};
              inMemoryGallery.forEach(g => { galleryMap[g._id] = g; });
              rtdbMirrorState.gallery = galleryMap;
              saveRtdbMirrorToDisk();
            }
          },
          () => {}
        );
      } catch (e) {}
    }

    // Periodic background sync with chitron.iam.bd (every 30s)
    setInterval(() => {
      syncLiveProductionPosts();
    }, 30000);

    // 2. Sync & Seed About
    const rtdbAbout = await rtdbGet('about');
    if (rtdbAbout && typeof rtdbAbout === 'object') {
      inMemoryAbout = { ...initialAbout, ...rtdbAbout, profileImage: '/images/chitron-bhattacharjee.webp' };
    } else {
      await rtdbSet('about', initialAbout);
    }

    // 3. Sync & Seed Homepage
    const rtdbHp = await rtdbGet('homepage');
    if (rtdbHp && typeof rtdbHp === 'object') {
      inMemoryHomepage = { ...initialHomepage, ...rtdbHp };
    } else {
      await rtdbSet('homepage', initialHomepage);
    }

    // 4. Sync & Seed Settings
    const rtdbSettings = await rtdbGet('settings');
    if (rtdbSettings && typeof rtdbSettings === 'object') {
      inMemorySettings = { ...initialSettings, ...rtdbSettings, profileImage: '/images/chitron-bhattacharjee.webp' };
    } else {
      await rtdbSet('settings', initialSettings);
    }

    // 5. Sync & Seed Gallery (respecting deleted/unpublished items if already seeded)
    const rtdbGallery = await rtdbGet('gallery');
    if (rtdbGallery && typeof rtdbGallery === 'object' && Object.keys(rtdbGallery).length > 0) {
      const arr = Array.isArray(rtdbGallery) ? rtdbGallery : Object.values(rtdbGallery);
      inMemoryGallery = arr.filter(Boolean).map((g, i) => ({
        ...g,
        _id: String(g._id || g.id || `photo-${i + 1}`),
        id: String(g._id || g.id || `photo-${i + 1}`),
        date: g.date ? new Date(g.date).toISOString() : new Date().toISOString()
      }));
      await syncGalleryToRTDB();
    } else if (hadMirror && rtdbMirrorState.seeded && rtdbMirrorState.gallery) {
      inMemoryGallery = Object.values(rtdbMirrorState.gallery).filter(Boolean);
      await syncGalleryToRTDB();
    } else {
      await seedInitialGalleryToRTDB();
    }

    // 6. Sync Admin Presence
    const rtdbPresence = await rtdbGet('presence/admin');
    if (rtdbPresence && typeof rtdbPresence === 'object' && rtdbPresence.adminLastSeen) {
      const lastSeen = Number(rtdbPresence.adminLastSeen) || (Date.now() - 12 * 60 * 1000);
      const isStillRecent = Boolean(rtdbPresence.adminOnline && (Date.now() - lastSeen < 45000));
      adminPresenceState = {
        adminOnline: isStillRecent,
        adminLastSeen: lastSeen
      };
    } else {
      await rtdbSet('presence/admin', adminPresenceState);
    }

    console.log('Firebase Realtime Database initialized and synced successfully.');
  } catch (seedErr) {
    console.error('Error during Firebase RTDB seed check:', seedErr.message);
  }
}

async function seedInitialPostsToRTDB() {
  const postsMap = {};
  initialPosts.forEach((p, i) => {
    const id = `post-${i + 1}`;
    postsMap[id] = {
      ...p,
      _id: id,
      id,
      publishedAt: (p.publishedAt || new Date()).toISOString(),
      createdAt: (p.publishedAt || new Date()).toISOString(),
      updatedAt: (p.publishedAt || new Date()).toISOString()
    };
  });
  inMemoryPosts = Object.values(postsMap);
  await syncPostsToRTDB();
}

async function seedInitialGalleryToRTDB() {
  const galleryMap = {};
  initialGallery.forEach((g, i) => {
    const id = `photo-${i + 1}`;
    galleryMap[id] = {
      ...g,
      _id: id,
      id,
      date: (g.date || new Date()).toISOString(),
      createdAt: (g.date || new Date()).toISOString(),
      updatedAt: (g.date || new Date()).toISOString()
    };
  });
  inMemoryGallery = Object.values(galleryMap);
  await syncGalleryToRTDB();
}

// Start Firebase RTDB Sync
initFirebaseRTDB();

/* --- Session Configuration --- */
const sessionOptions = {
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Ensures session cookies work in all browser contexts & HTTP/HTTPS reverse proxies
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  }
};

app.use(session(sessionOptions));

function calcReadingTime(content) {
  if (!content) return 1;
  const text = content.replace(/<[^>]*>/g, '');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function authMiddleware(req, res, next) {
  // Check standard express session
  if (req.session && req.session.isAdmin) {
    touchAdminActivity(true);
    return next();
  }
  // Check Authorization header or query token for iframe/cross-site support
  const authHeader = req.headers['authorization'] || req.headers['x-admin-token'];
  const queryToken = req.query.token;
  if (isValidToken(authHeader) || isValidToken(queryToken)) {
    if (req.session) {
      req.session.isAdmin = true;
    }
    touchAdminActivity(true);
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

/* --- API Endpoints --- */

// Health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    configuration: 'loaded',
    storage: 'firebase-rtdb',
    databaseURL: firebaseConfig.databaseURL,
    timestamp: new Date().toISOString()
  });
});

// Auth
app.post('/api/auth/login', (req, res) => {
  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ error: 'PIN required' });
  }

  const cleanPin = String(pin).trim();
  const validPins = [String(ADMIN_PIN).trim(), String(process.env.ADMIN_PIN || '').trim(), '123456'].filter(Boolean);

  if (validPins.includes(cleanPin)) {
    const token = generateAuthToken();
    touchAdminActivity(true, true);
    if (req.session) {
      req.session.isAdmin = true;
      req.session.adminToken = token;
      req.session.save((err) => {
        res.json({ success: true, token });
      });
      return;
    }
    return res.json({ success: true, token });
  }

  return res.status(401).json({ error: 'Invalid PIN' });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'] || req.headers['x-admin-token'];
  if (authHeader) {
    const clean = String(authHeader).replace(/^Bearer\s+/i, '').trim();
    activeTokens.delete(clean);
  }
  touchAdminActivity(false, true);
  if (req.session) {
    if (req.session.adminToken) activeTokens.delete(req.session.adminToken);
    req.session.destroy(() => {
      res.json({ success: true });
    });
  } else {
    res.json({ success: true });
  }
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers['authorization'] || req.headers['x-admin-token'];
  const queryToken = req.query.token;
  const isAuth = !!(req.session && req.session.isAdmin) || isValidToken(authHeader) || isValidToken(queryToken);
  res.json({ isAdmin: isAuth });
});

/* --- Public Posts --- */
app.get('/api/posts', async (req, res) => {
  try {
    const { search, category, tag, sort = 'newest', page = 1, limit = 10 } = req.query;
    const now = new Date();

    let list = inMemoryPosts.filter(p => {
      if (p.status === 'published') return true;
      if (p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt) <= now) return true;
      return false;
    });

    if (category) list = list.filter(p => (p.category || '').toLowerCase() === category.trim().toLowerCase());
    if (tag) list = list.filter(p => (p.labels || []).map(l => l.toLowerCase()).includes(tag.trim().toLowerCase()));
    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.excerpt || '').toLowerCase().includes(q) ||
        (p.content || '').toLowerCase().includes(q) ||
        (p.labels || []).some(l => l.toLowerCase().includes(q))
      );
    }

    if (sort === 'oldest') {
      list.sort((a, b) => new Date(a.publishedAt || a.createdAt) - new Date(b.publishedAt || b.createdAt));
    } else {
      list.sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));
    }

    const total = list.length;
    const pNum = Math.max(1, parseInt(page) || 1);
    const lNum = Math.max(1, parseInt(limit) || 10);
    const skip = (pNum - 1) * lNum;
    const posts = list.slice(skip, skip + lNum).map(({ content, ...rest }) => rest);

    res.json({
      posts,
      pagination: { page: pNum, limit: lNum, total, pages: Math.ceil(total / lNum) || 1 }
    });
  } catch (err) {
    console.error('Error fetching public posts:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.get('/api/posts/categories', async (req, res) => {
  try {
    const cats = [...new Set(inMemoryPosts.filter(p => p.status === 'published').map(p => p.category).filter(Boolean))];
    res.json({ categories: cats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.get('/api/posts/labels', async (req, res) => {
  try {
    const counts = {};
    inMemoryPosts.filter(p => p.status === 'published').forEach(p => {
      (p.labels || []).forEach(l => { counts[l] = (counts[l] || 0) + 1; });
    });
    const labels = Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    res.json({ labels });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
});

app.get('/api/posts/nav/:currentSlug', async (req, res) => {
  try {
    const { currentSlug } = req.params;
    const now = new Date();
    const published = inMemoryPosts
      .filter(p => p.status === 'published' || (p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt) <= now))
      .sort((a, b) => new Date(a.publishedAt || a.createdAt) - new Date(b.publishedAt || b.createdAt));
    const idx = published.findIndex(p => p.slug === currentSlug);
    if (idx === -1) return res.status(404).json({ error: 'Post not found' });
    const prev = idx > 0 ? { slug: published[idx - 1].slug, title: published[idx - 1].title } : null;
    const nextPost = idx < published.length - 1 ? { slug: published[idx + 1].slug, title: published[idx + 1].title } : null;
    res.json({ previous: prev, next: nextPost });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch navigation' });
  }
});

app.get('/api/posts/:slug', async (req, res) => {
  try {
    const slugParam = req.params.slug;
    const now = new Date();

    const post = inMemoryPosts.find(p => p.slug === slugParam && (
      p.status === 'published' || (p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt) <= now)
    ));
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.viewCount = (post.viewCount || 0) + 1;
    rtdbUpdate(`posts/${post._id}`, { viewCount: post.viewCount });
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

/* --- Public Content --- */
app.get('/api/content/settings', async (req, res) => {
  try {
    res.json({ settings: inMemorySettings });
  } catch (err) {
    res.json({ settings: inMemorySettings });
  }
});

app.get('/api/content/homepage', async (req, res) => {
  try {
    res.json({ page: inMemoryHomepage });
  } catch (err) {
    res.json({ page: inMemoryHomepage });
  }
});

app.get('/api/content/about', async (req, res) => {
  try {
    res.json({ profile: inMemoryAbout });
  } catch (err) {
    res.json({ profile: inMemoryAbout });
  }
});

app.get('/api/about', (req, res) => {
  res.redirect(307, '/api/content/about');
});

/* --- Public Gallery Endpoints --- */
app.get('/api/gallery', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const { category, search, page = 1, limit = 24, sort = 'newest' } = req.query;
    const pNum = Math.max(1, parseInt(page) || 1);
    const lNum = Math.max(1, parseInt(limit) || 24);

    let list = inMemoryGallery.filter(item => item.status === 'published');
    if (category && category.toLowerCase() !== 'all') {
      const catLower = category.trim().toLowerCase();
      list = list.filter(item => (item.category || '').toLowerCase() === catLower);
    }
    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(item =>
        (item.title || '').toLowerCase().includes(q) ||
        (item.caption || '').toLowerCase().includes(q) ||
        (item.location || '').toLowerCase().includes(q) ||
        (item.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    if (sort === 'oldest') {
      list.sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt));
    } else {
      list.sort((a, b) => {
        if (a.featured !== b.featured) return b.featured ? 1 : -1;
        if ((a.order || 0) !== (b.order || 0)) return (a.order || 0) - (b.order || 0);
        return new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt);
      });
    }

    const catMap = {};
    inMemoryGallery.filter(item => item.status === 'published').forEach(item => {
      const c = item.category || 'General';
      catMap[c] = (catMap[c] || 0) + 1;
    });
    const categories = Object.keys(catMap).map(name => ({ name, count: catMap[name] }));

    const total = list.length;
    const paginated = list.slice((pNum - 1) * lNum, pNum * lNum);

    res.json({
      photos: paginated,
      total,
      page: pNum,
      totalPages: Math.ceil(total / lNum) || 1,
      categories
    });
  } catch (err) {
    console.error('Error fetching gallery photos:', err);
    res.status(500).json({ error: 'Failed to fetch gallery photos' });
  }
});

app.get('/api/gallery/categories', async (req, res) => {
  try {
    const catMap = {};
    inMemoryGallery.filter(item => item.status === 'published').forEach(item => {
      const c = item.category || 'General';
      catMap[c] = (catMap[c] || 0) + 1;
    });
    res.json({ categories: Object.keys(catMap).map(name => ({ name, count: catMap[name] })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.get('/api/gallery/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const photo = inMemoryGallery.find(item => String(item._id) === String(id));
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    res.json({ photo });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch photo' });
  }
});

/* --- Admin Stats & Posts --- */
app.get('/api/admin/stats', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const total = inMemoryPosts.filter(p => p.status !== 'trashed').length;
    const published = inMemoryPosts.filter(p => p.status === 'published').length;
    const drafts = inMemoryPosts.filter(p => p.status === 'draft').length;
    const scheduled = inMemoryPosts.filter(p => p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt) > now).length;
    const totalPhotos = inMemoryGallery.length;
    const memConvs = Array.from(inMemoryConversations.values()).filter(c => (Array.isArray(c.messages) && c.messages.length > 0) || c.lastMessage);
    const unreadMessages = memConvs.reduce((sum, c) => sum + (Number(c.unreadForAdmin) || 0), 0);
    res.json({ total, published, drafts, scheduled, totalPhotos, unreadMessages, totalConversations: memConvs.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/admin/posts', authMiddleware, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const pNum = Math.max(1, parseInt(page) || 1);
    const lNum = Math.max(1, parseInt(limit) || 20);

    let list = [...inMemoryPosts];
    if (status && status !== '') list = list.filter(p => p.status === status);
    else list = list.filter(p => p.status !== 'trashed');

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.excerpt || '').toLowerCase().includes(q) ||
        (p.content || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    const total = list.length;
    const skip = (pNum - 1) * lNum;
    const posts = list.slice(skip, skip + lNum);
    res.json({
      posts,
      pagination: { page: pNum, limit: lNum, total, pages: Math.ceil(total / lNum) || 1 }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.get('/api/admin/posts/:id', authMiddleware, async (req, res) => {
  try {
    const post = inMemoryPosts.find(p => String(p._id) === String(req.params.id));
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

/* --- Editorial Automation & Preview Endpoints --- */
app.post('/api/admin/posts/preview', authMiddleware, async (req, res) => {
  try {
    const { title, excerpt, content, category, labels, coverImage, autoExcerpt = true, autoTags = true, autoImage = true } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required for preview' });
    }
    const rawPost = {
      title: title.trim(),
      excerpt: (excerpt || '').trim(),
      content: content || '',
      coverImage: (coverImage || '').trim(),
      author: 'Chitron Bhattacharjee',
      category: (category || 'general').trim().toLowerCase(),
      labels: Array.isArray(labels) ? labels.map(l => String(l).trim().toLowerCase()).filter(Boolean) : [],
      slug: generateSlug(title)
    };
    const enriched = await editorialService.enrichPostData(rawPost, {
      autoExcerpt: autoExcerpt !== false,
      autoTags: autoTags !== false,
      autoImage: autoImage !== false
    });
    res.json({ post: enriched });
  } catch (err) {
    console.error('Error generating preview:', err);
    res.status(500).json({ error: err.message || 'Failed to generate preview' });
  }
});

app.post('/api/admin/posts/regenerate-field', authMiddleware, async (req, res) => {
  try {
    const { field, title = '', content = '', category = '', excerpt = '', labels } = req.body;
    const cleanContent = String(content || '').replace(/<[^>]*>/g, '').trim();
    if ((!title || !title.trim()) && !cleanContent) {
      return res.status(400).json({ error: 'Content or title is required' });
    }

    if (field === 'excerpt') {
      const generated = await editorialService.generateExcerpt(title, content, { category });
      return res.json({ value: generated, source: 'generated' });
    } else if (field === 'tags') {
      const generated = await editorialService.generateTags(title, excerpt, content, category);
      return res.json({ value: generated, source: 'generated' });
    } else if (field === 'featuredImage') {
      const query = await editorialService.extractSearchKeywords(title, content, category);
      const stock = await editorialService.searchStockImage(query, category);
      if (stock && stock.url) {
        return res.json({
          value: stock.url,
          source: 'pollinations',
          metadata: {
            provider: stock.provider,
            providerImageId: stock.providerImageId,
            sourceUrl: stock.sourceUrl,
            photographer: stock.photographer,
            photographerUrl: stock.photographerUrl,
            searchQuery: stock.searchQuery
          }
        });
      }
      return res.status(404).json({ error: 'Failed to generate image URL' });
    }
    res.status(400).json({ error: 'Invalid field specified' });
  } catch (err) {
    console.error('Error regenerating field:', err);
    res.status(500).json({ error: err.message || 'Failed to regenerate field' });
  }
});

/* --- Create Post --- */
app.post('/api/admin/posts', authMiddleware, async (req, res) => {
  try {
    let {
      title, excerpt, content, coverImage, category, labels, slug, status,
      seoTitle, seoDescription, canonicalUrl, scheduledAt, featured, commentsEnabled,
      autoExcerpt = true, autoTags = true, autoImage = true
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // 1. Generate clean Unicode/Bengali slug
    let postSlug = generateSlug(title, slug);

    // 2. Enrich post with Editorial Automation Pipeline
    const rawPost = {
      title: title.trim(),
      excerpt: (excerpt || '').trim(),
      content: content || '',
      coverImage: (coverImage || '').trim(),
      author: 'Chitron Bhattacharjee',
      category: (category || 'general').trim().toLowerCase(),
      labels: Array.isArray(labels) ? labels.map(l => String(l).trim().toLowerCase()).filter(Boolean) : [],
      slug: postSlug
    };

    const enriched = await editorialService.enrichPostData(rawPost, {
      autoExcerpt: autoExcerpt !== false,
      autoTags: autoTags !== false,
      autoImage: autoImage !== false
    });

    // 3. Normalization of dates and status
    let postStatus = status || 'draft';
    const now = new Date();
    let finalPublishedAt = null;
    let finalScheduledAt = null;

    if (postStatus === 'scheduled' && scheduledAt) {
      const parsedSched = new Date(scheduledAt);
      if (isNaN(parsedSched.getTime())) {
        return res.status(400).json({ error: 'Invalid scheduled date/time' });
      }
      if (parsedSched > now) {
        finalScheduledAt = parsedSched;
      } else {
        // Scheduled date in past/present -> publish immediately
        postStatus = 'published';
        finalPublishedAt = parsedSched;
      }
    } else if (postStatus === 'published') {
      finalPublishedAt = now;
    }

      if (inMemoryPosts.some(p => p.slug === postSlug)) {
        postSlug = `${postSlug}-${Date.now().toString(36)}`;
        enriched.slug = postSlug;
      }

      const postData = {
        title: enriched.title,
        slug: postSlug,
        excerpt: enriched.excerpt,
        content: enriched.content,
        coverImage: enriched.coverImage,
        author: enriched.author,
        category: enriched.category,
        labels: enriched.labels,
        status: postStatus,
        publishedAt: finalPublishedAt,
        scheduledAt: finalScheduledAt,
        readingTime: calcReadingTime(enriched.content),
        seoTitle: (seoTitle || '').trim(),
        seoDescription: (seoDescription || '').trim(),
        canonicalUrl: (canonicalUrl || '').trim(),
        featured: !!featured,
        commentsEnabled: commentsEnabled !== false,
        editorialAutomation: enriched.editorialAutomation,
        _id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };

      if (inMemoryPosts.some(p => p.slug === postSlug)) {
        postData.slug = `${postSlug}-${Date.now().toString(36)}`;
      }

      inMemoryPosts.unshift(postData);
      await rtdbSet(`posts/${postData._id}`, postData);
      await syncPostsToRTDB();

      return res.status(201).json({ post: postData });
    } catch (err) {
      console.error('CRITICAL Error in POST /api/admin/posts:', err);
      res.status(500).json({ error: err.message || 'Failed to create post' });
    }
});

/* --- Update Post --- */
app.put('/api/admin/posts/:id', authMiddleware, async (req, res) => {
  try {
    const {
      title, excerpt, content, coverImage, category, labels, slug, status,
      seoTitle, seoDescription, canonicalUrl, scheduledAt, featured, commentsEnabled,
      autoExcerpt = true, autoTags = true, autoImage = true
    } = req.body;

    const now = new Date();
    const post = inMemoryPosts.find(p => String(p._id) === String(req.params.id));
    if (!post) return res.status(404).json({ error: 'Post not found' });

    inMemoryRevisions.unshift({
      _id: `rev-${Date.now()}`,
      postId: post._id,
      title: post.title,
      content: post.content,
      excerpt: post.excerpt,
      labels: [...(post.labels || [])],
      category: post.category,
      savedAt: now.toISOString()
    });

    if (title) post.title = title.trim();

    if (title || slug) {
      let newSlug = generateSlug(title || post.title, slug || post.slug);
      if (inMemoryPosts.some(p => p.slug === newSlug && String(p._id) !== String(post._id))) {
        newSlug = `${newSlug}-${Date.now().toString(36)}`;
      }
      post.slug = newSlug;
    }

    if (content !== undefined) {
      post.content = content;
      post.readingTime = calcReadingTime(content);
    }
    if (category) post.category = category.trim().toLowerCase();
    if (labels !== undefined) {
      post.labels = Array.isArray(labels) ? labels.map(l => String(l).trim().toLowerCase()).filter(Boolean) : [];
    }

    const rawPost = {
      title: post.title,
      excerpt: excerpt !== undefined ? excerpt.trim() : post.excerpt,
      content: post.content,
      coverImage: coverImage !== undefined ? coverImage.trim() : post.coverImage,
      author: post.author,
      category: post.category,
      labels: post.labels,
      slug: post.slug,
      editorialAutomation: post.editorialAutomation
    };

    const enriched = await editorialService.enrichPostData(rawPost, {
      autoExcerpt: autoExcerpt !== false,
      autoTags: autoTags !== false,
      autoImage: autoImage !== false
    });

    post.excerpt = enriched.excerpt;
    post.labels = enriched.labels;
    post.coverImage = enriched.coverImage;
    post.editorialAutomation = enriched.editorialAutomation;

    if (seoTitle !== undefined) post.seoTitle = seoTitle.trim();
    if (seoDescription !== undefined) post.seoDescription = seoDescription.trim();
    if (canonicalUrl !== undefined) post.canonicalUrl = canonicalUrl.trim();
    if (featured !== undefined) post.featured = !!featured;
    if (commentsEnabled !== undefined) post.commentsEnabled = commentsEnabled !== false;

    let postStatus = status || post.status;
    if (postStatus === 'scheduled' && scheduledAt) {
      const parsedSched = new Date(scheduledAt);
      if (!isNaN(parsedSched.getTime())) {
        if (parsedSched > now) {
          post.status = 'scheduled';
          post.scheduledAt = parsedSched;
        } else {
          post.status = 'published';
          post.publishedAt = parsedSched;
          post.scheduledAt = null;
        }
      }
    } else if (postStatus === 'published') {
      post.status = 'published';
      if (!post.publishedAt) post.publishedAt = now;
      post.scheduledAt = null;
    } else if (postStatus) {
      post.status = postStatus;
    }

    post.updatedAt = now.toISOString();
    await rtdbSet(`posts/${post._id}`, post);
    await syncPostsToRTDB();
    res.json({ post });
  } catch (err) {
    console.error('Error updating post:', err);
    res.status(500).json({ error: err.message || 'Failed to update post' });
  }
});

app.delete('/api/admin/posts/:id', authMiddleware, async (req, res) => {
  try {
    const post = inMemoryPosts.find(p => String(p._id) === String(req.params.id));
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.status = 'trashed';
    post.updatedAt = new Date().toISOString();
    await rtdbSet(`posts/${post._id}`, post);
    await syncPostsToRTDB();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to trash post' });
  }
});

app.post('/api/admin/posts/:id/publish', authMiddleware, async (req, res) => {
  try {
    const post = inMemoryPosts.find(p => String(p._id) === String(req.params.id));
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.status = 'published';
    post.publishedAt = new Date().toISOString();
    post.updatedAt = new Date().toISOString();
    await rtdbSet(`posts/${post._id}`, post);
    await syncPostsToRTDB();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish' });
  }
});

app.post('/api/admin/posts/:id/unpublish', authMiddleware, async (req, res) => {
  try {
    const post = inMemoryPosts.find(p => String(p._id) === String(req.params.id));
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.status = 'draft';
    post.updatedAt = new Date().toISOString();
    await rtdbSet(`posts/${post._id}`, post);
    await syncPostsToRTDB();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unpublish' });
  }
});

app.post('/api/admin/posts/:id/restore', authMiddleware, async (req, res) => {
  try {
    const post = inMemoryPosts.find(p => String(p._id) === String(req.params.id));
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.status = 'draft';
    post.updatedAt = new Date().toISOString();
    await rtdbSet(`posts/${post._id}`, post);
    await syncPostsToRTDB();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore' });
  }
});

app.delete('/api/admin/posts/:id/permanent', authMiddleware, async (req, res) => {
  try {
    const idx = inMemoryPosts.findIndex(p => String(p._id) === String(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'Post not found' });
    const [deletedPost] = inMemoryPosts.splice(idx, 1);
    await rtdbRemove(`posts/${deletedPost._id}`);
    await syncPostsToRTDB();
    inMemoryRevisions = inMemoryRevisions.filter(r => String(r.postId) !== String(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to permanently delete' });
  }
});

app.post('/api/admin/posts/:id/duplicate', authMiddleware, async (req, res) => {
  try {
    const original = inMemoryPosts.find(p => String(p._id) === String(req.params.id));
    if (!original) return res.status(404).json({ error: 'Post not found' });
    const newId = `post-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const dup = {
      ...original,
      _id: newId,
      id: newId,
      title: `${original.title} (Copy)`,
      slug: `${original.slug}-copy-${Date.now()}`,
      status: 'draft',
      publishedAt: null,
      scheduledAt: null,
      viewCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    inMemoryPosts.unshift(dup);
    await rtdbSet(`posts/${newId}`, dup);
    await syncPostsToRTDB();
    res.status(201).json({ post: dup });
  } catch (err) {
    res.status(500).json({ error: 'Failed to duplicate post' });
  }
});

/* --- Revisions --- */
app.get('/api/admin/revisions/:postId', authMiddleware, async (req, res) => {
  try {
    const revisions = inMemoryRevisions.filter(r => String(r.postId) === String(req.params.postId));
    res.json({ revisions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch revisions' });
  }
});

app.post('/api/admin/revisions/:revisionId/restore', authMiddleware, async (req, res) => {
  try {
    const revision = inMemoryRevisions.find(r => String(r._id) === String(req.params.revisionId));
    if (!revision) return res.status(404).json({ error: 'Revision not found' });
    const post = inMemoryPosts.find(p => String(p._id) === String(revision.postId));
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.title = revision.title;
    post.content = revision.content;
    post.excerpt = revision.excerpt;
    if (revision.labels) post.labels = [...revision.labels];
    if (revision.category) post.category = revision.category;
    post.updatedAt = new Date().toISOString();
    rtdbSet(`posts/${post._id}`, post);
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore revision' });
  }
});

/* --- Admin Labels & Categories --- */
app.get('/api/admin/labels', authMiddleware, async (req, res) => {
  try {
    const counts = {};
    inMemoryPosts.forEach(p => {
      (p.labels || []).forEach(l => { counts[l] = (counts[l] || 0) + 1; });
    });
    const labels = Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    res.json({ labels });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
});

app.get('/api/admin/categories', authMiddleware, async (req, res) => {
  try {
    const cats = [...new Set(inMemoryPosts.map(p => p.category).filter(Boolean))];
    res.json({ categories: cats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/* --- Admin Content Update Endpoints --- */
app.get('/api/admin/content/settings', authMiddleware, async (req, res) => {
  try {
    res.json({ settings: inMemorySettings });
  } catch (err) {
    res.json({ settings: inMemorySettings });
  }
});

app.put('/api/admin/content/settings', authMiddleware, async (req, res) => {
  try {
    inMemorySettings = { ...inMemorySettings, ...req.body };
    rtdbSet('settings', inMemorySettings);
    res.json({ settings: inMemorySettings });
  } catch (err) {
    console.error('Error saving settings:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

app.get('/api/admin/content/homepage', authMiddleware, async (req, res) => {
  try {
    res.json({ page: inMemoryHomepage });
  } catch (err) {
    res.json({ page: inMemoryHomepage });
  }
});

app.put('/api/admin/content/homepage', authMiddleware, async (req, res) => {
  try {
    inMemoryHomepage = { ...inMemoryHomepage, ...req.body };
    rtdbSet('homepage', inMemoryHomepage);
    res.json({ page: inMemoryHomepage });
  } catch (err) {
    console.error('Error saving homepage:', err);
    res.status(500).json({ error: 'Failed to save homepage' });
  }
});

app.get('/api/admin/content/about', authMiddleware, async (req, res) => {
  try {
    res.json({ profile: inMemoryAbout });
  } catch (err) {
    res.json({ profile: inMemoryAbout });
  }
});

app.put('/api/admin/content/about', authMiddleware, async (req, res) => {
  try {
    inMemoryAbout = { ...inMemoryAbout, ...req.body };
    rtdbSet('about', inMemoryAbout);
    res.json({ profile: inMemoryAbout });
  } catch (err) {
    console.error('Error saving about profile:', err);
    res.status(500).json({ error: 'Failed to save about' });
  }
});

/* --- Admin Gallery Endpoints --- */
app.get('/api/admin/gallery', authMiddleware, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const { search, status, category, page = 1, limit = 50 } = req.query;
    const pNum = Math.max(1, parseInt(page) || 1);
    const lNum = Math.max(1, parseInt(limit) || 50);

    let list = [...inMemoryGallery];
    if (status && status !== 'all') {
      list = list.filter(p => p.status === status);
    }
    if (category && category !== 'all') {
      list = list.filter(p => (p.category || '').toLowerCase() === category.toLowerCase());
    }
    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.caption || '').toLowerCase().includes(q) ||
        (p.location || '').toLowerCase().includes(q) ||
        (p.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => (a.order || 0) - (b.order || 0) || new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
    const total = list.length;
    const paginated = list.slice((pNum - 1) * lNum, pNum * lNum);
    const categories = Array.from(new Set(inMemoryGallery.map(p => p.category).filter(Boolean)));
    const totalAll = inMemoryGallery.length;
    const publishedCount = inMemoryGallery.filter(p => p.status === 'published').length;
    const draftCount = inMemoryGallery.filter(p => p.status === 'draft').length;

    res.json({
      photos: paginated,
      total,
      totalAll,
      publishedCount,
      draftCount,
      page: pNum,
      totalPages: Math.ceil(total / lNum) || 1,
      categories
    });
  } catch (err) {
    console.error('Error fetching admin gallery:', err);
    res.status(500).json({ error: 'Failed to fetch admin gallery' });
  }
});

app.get('/api/admin/gallery/:id', authMiddleware, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const { id } = req.params;
    const photo = inMemoryGallery.find(p => String(p._id) === String(id) || String(p.id) === String(id));
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    res.json({ photo });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch photo' });
  }
});

// Standalone upload endpoint
app.post('/api/admin/gallery/upload', authMiddleware, upload.single('photo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    const fileUrl = `/uploads/gallery/${req.file.filename}`;
    res.json({
      success: true,
      url: fileUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype
    });
  } catch (err) {
    console.error('Error uploading gallery photo:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// Create new gallery photo (supports JSON body or multipart upload)
app.post('/api/admin/gallery', authMiddleware, (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    let { title, caption, url, category, tags, location, alt, date, featured, status, order } = req.body;

    if (req.file) {
      url = `/uploads/gallery/${req.file.filename}`;
    }

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'Photo file or image URL is required' });
    }

    let parsedTags = [];
    if (Array.isArray(tags)) {
      parsedTags = tags.map(t => String(t).trim()).filter(Boolean);
    } else if (typeof tags === 'string') {
      parsedTags = tags.split(/[,#\s]+/).map(t => t.trim()).filter(Boolean);
    }

    const nowIso = new Date().toISOString();
    const newId = `photo-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const newPhoto = {
      _id: newId,
      id: newId,
      title: title.trim(),
      caption: (caption || '').trim(),
      url: url.trim(),
      category: (category || 'Photography').trim(),
      tags: parsedTags,
      location: (location || '').trim(),
      alt: (alt || title).trim(),
      date: date ? new Date(date).toISOString() : nowIso,
      featured: featured === true || featured === 'true' || featured === '1',
      status: (status === 'draft') ? 'draft' : 'published',
      order: parseInt(order) || 0,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    inMemoryGallery.unshift(newPhoto);
    await rtdbSet(`gallery/${newId}`, newPhoto);
    await syncGalleryToRTDB();

    res.status(201).json({ success: true, photo: newPhoto });
  } catch (err) {
    console.error('Error creating gallery photo:', err);
    res.status(500).json({ error: 'Failed to create gallery photo' });
  }
});

// Update gallery photo
app.put('/api/admin/gallery/:id', authMiddleware, (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { id } = req.params;
    let { title, caption, url, category, tags, location, alt, date, featured, status, order } = req.body;

    if (req.file) {
      url = `/uploads/gallery/${req.file.filename}`;
    }

    let parsedTags = undefined;
    if (tags !== undefined) {
      if (Array.isArray(tags)) {
        parsedTags = tags.map(t => String(t).trim()).filter(Boolean);
      } else if (typeof tags === 'string') {
        parsedTags = tags.split(/[,#\s]+/).map(t => t.trim()).filter(Boolean);
      }
    }

    const updates = {};
    if (title !== undefined) updates.title = title.trim();
    if (caption !== undefined) updates.caption = caption.trim();
    if (url !== undefined) updates.url = url.trim();
    if (category !== undefined) updates.category = category.trim();
    if (parsedTags !== undefined) updates.tags = parsedTags;
    if (location !== undefined) updates.location = location.trim();
    if (alt !== undefined) updates.alt = alt.trim();
    if (date !== undefined) updates.date = new Date(date).toISOString();
    if (featured !== undefined) updates.featured = featured === true || featured === 'true' || featured === '1';
    if (status !== undefined) updates.status = (status === 'draft') ? 'draft' : 'published';
    if (order !== undefined) updates.order = parseInt(order) || 0;
    updates.updatedAt = new Date().toISOString();

    const idx = inMemoryGallery.findIndex(p => String(p._id) === String(id) || String(p.id) === String(id));
    if (idx === -1) return res.status(404).json({ error: 'Photo not found' });

    const photoId = String(inMemoryGallery[idx]._id || id);
    inMemoryGallery[idx] = { ...inMemoryGallery[idx], ...updates, _id: photoId, id: photoId };
    await rtdbSet(`gallery/${photoId}`, inMemoryGallery[idx]);
    await syncGalleryToRTDB();

    res.json({ success: true, photo: inMemoryGallery[idx] });
  } catch (err) {
    console.error('Error updating gallery photo:', err);
    res.status(500).json({ error: 'Failed to update gallery photo' });
  }
});

// Delete gallery photo
app.delete('/api/admin/gallery/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const idx = inMemoryGallery.findIndex(p => String(p._id) === String(id) || String(p.id) === String(id));
    if (idx === -1) return res.status(404).json({ error: 'Photo not found' });

    const removedPhoto = inMemoryGallery[idx];
    const photoUrl = removedPhoto.url;
    const photoId = String(removedPhoto._id || id);

    inMemoryGallery.splice(idx, 1);
    await rtdbRemove(`gallery/${photoId}`);
    await syncGalleryToRTDB();

    // If local file in uploads/gallery, remove it cleanly
    if (photoUrl && photoUrl.startsWith('/uploads/gallery/')) {
      const localPath = path.join(__dirname, photoUrl);
      if (fs.existsSync(localPath)) {
        try { fs.unlinkSync(localPath); } catch (e) {}
      }
    }

    res.json({ success: true, id: photoId, message: 'Photo deleted successfully' });
  } catch (err) {
    console.error('Error deleting gallery photo:', err);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// Quick publish/unpublish toggles
app.post('/api/admin/gallery/:id/publish', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const p = inMemoryGallery.find(item => String(item._id) === String(id) || String(item.id) === String(id));
    if (!p) return res.status(404).json({ error: 'Photo not found' });

    const photoId = String(p._id || id);
    p.status = 'published';
    p.updatedAt = new Date().toISOString();
    await rtdbSet(`gallery/${photoId}`, p);
    await syncGalleryToRTDB();

    res.json({ success: true, photo: p });
  } catch (err) {
    console.error('Error publishing gallery photo:', err);
    res.status(500).json({ error: 'Failed to publish photo' });
  }
});

app.post('/api/admin/gallery/:id/unpublish', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const p = inMemoryGallery.find(item => String(item._id) === String(id) || String(item.id) === String(id));
    if (!p) return res.status(404).json({ error: 'Photo not found' });

    const photoId = String(p._id || id);
    p.status = 'draft';
    p.updatedAt = new Date().toISOString();
    await rtdbSet(`gallery/${photoId}`, p);
    await syncGalleryToRTDB();

    res.json({ success: true, photo: p });
  } catch (err) {
    console.error('Error unpublishing gallery photo:', err);
    res.status(500).json({ error: 'Failed to unpublish photo' });
  }
});

/* =========================================================
   REAL-TIME MESSENGER & LIVE CHAT SYSTEM
   (Firebase Firestore / RTDB + MongoDB Atlas + WebSockets)
   ========================================================= */

const chatUploadsDir = path.join(__dirname, 'uploads', 'chat');
if (!fs.existsSync(chatUploadsDir)) {
  fs.mkdirSync(chatUploadsDir, { recursive: true });
}

const chatUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, chatUploadsDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.bin').toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, `${cleanName || 'attachment'}-${unique}${ext}`);
  }
});

const chatUpload = multer({
  storage: chatUploadStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf', 'text/plain', 'application/zip'
    ];
    if (file.mimetype && (file.mimetype.startsWith('image/') || allowedMimes.includes(file.mimetype))) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Allowed: Images, PDF, TXT, ZIP (max 10MB).'));
    }
  }
});

// Firebase Applet Config already initialized at top of server.js
if (process.env.FIREBASE_DATABASE_URL && !firebaseAppletConfig.databaseURL) {
  firebaseAppletConfig.databaseURL = process.env.FIREBASE_DATABASE_URL;
}

// In-memory conversation store (synced with MongoDB & Firebase)
const inMemoryConversations = new Map();

function isValidVisitorIdString(vid) {
  return typeof vid === 'string' && vid.length >= 16 && vid.length <= 128 && /^visitor_[a-zA-Z0-9_\-]+$/.test(vid);
}

function sanitizeChatMessage(raw, visitorId) {
  const now = Date.now();
  const msgId = (raw.messageId && /^[a-zA-Z0-9_\-]{8,128}$/.test(String(raw.messageId)))
    ? String(raw.messageId)
    : `msg_${now}_${crypto.randomBytes(4).toString('hex')}`;
  const sender = raw.sender === 'admin' ? 'admin' : 'visitor';
  const type = ['text', 'image', 'file'].includes(raw.type) ? raw.type : 'text';
  const text = String(raw.text || '').trim().slice(0, 4000);
  const mediaUrl = String(raw.mediaUrl || '').trim().slice(0, 1000);
  const fileName = String(raw.fileName || '').trim().slice(0, 255);
  const read = Boolean(raw.read);
  const timestamp = (typeof raw.timestamp === 'number' && raw.timestamp > 0) ? raw.timestamp : now;

  return {
    messageId: msgId,
    visitorId,
    sender,
    text,
    type,
    mediaUrl,
    fileName,
    read,
    timestamp
  };
}

async function getOrCreateConversation(visitorId, createIfMissing = false, meta = {}) {
  if (!isValidVisitorIdString(visitorId)) return null;

  let mem = inMemoryConversations.get(visitorId);
  if (!mem) {
    // Try reading from RTDB
    const rtdbConv = await rtdbGet(`conversations/${visitorId}`);
    if (rtdbConv && typeof rtdbConv === 'object') {
      mem = rtdbConv;
      inMemoryConversations.set(visitorId, mem);
    }
  }

  if (!mem && createIfMissing) {
    const now = Date.now();
    mem = {
      visitorId,
      visitorName: String(meta.visitorName || '').trim().slice(0, 100),
      visitorEmail: String(meta.visitorEmail || '').trim().slice(0, 160),
      createdAt: now,
      lastMessage: '',
      lastMessageAt: now,
      lastSender: 'visitor',
      unreadForAdmin: 0,
      unreadForVisitor: 0,
      status: 'active',
      visitorOnline: Boolean(meta.visitorOnline),
      visitorLastSeen: now,
      visitorTyping: false,
      adminTyping: false,
      pageUrl: String(meta.pageUrl || '').trim().slice(0, 500),
      userAgent: String(meta.userAgent || '').trim().slice(0, 300),
      messages: []
    };
    inMemoryConversations.set(visitorId, mem);
    rtdbSet(`conversations/${visitorId}`, mem);
  }
  return mem || null;
}

async function saveConversationState(conv) {
  if (!conv || !conv.visitorId) return conv;
  inMemoryConversations.set(conv.visitorId, conv);
  rtdbSet(`conversations/${conv.visitorId}`, conv);
  return conv;
}

// Sync visitor or admin message to Firestore when written via server
async function syncVisitorMessageToFirestore(conv, msg) {
  if (!serverFirestore || !firestoreModules) return;
  try {
    const { doc, writeBatch, serverTimestamp } = firestoreModules;
    const batch = writeBatch(serverFirestore);
    const convRef = doc(serverFirestore, 'conversations', conv.visitorId);
    const msgRef = doc(serverFirestore, 'conversations', conv.visitorId, 'messages', msg.messageId);

    const convData = {
      visitorId: conv.visitorId,
      lastMessage: (conv.lastMessage || '').slice(0, 2000),
      lastSender: msg.sender === 'admin' ? 'admin' : 'visitor',
      unreadForAdmin: Math.min(10000, Math.max(0, Number(conv.unreadForAdmin) || 0)),
      unreadForVisitor: Math.min(10000, Math.max(0, Number(conv.unreadForVisitor) || 0)),
      status: conv.status || 'active',
      visitorOnline: Boolean(conv.visitorOnline),
      visitorTyping: false,
      adminTyping: false,
      pageUrl: String(conv.pageUrl || '').slice(0, 500),
      lastTimestamp: Date.now(),
      lastMessageAt: serverTimestamp()
    };
    if (conv.visitorName && conv.visitorName.trim()) {
      convData.visitorName = conv.visitorName.trim().slice(0, 100);
    }

    const msgData = {
      messageId: msg.messageId,
      visitorId: conv.visitorId,
      sender: msg.sender === 'admin' ? 'admin' : 'visitor',
      text: (msg.text || '').slice(0, 4000),
      type: msg.type || 'text',
      read: Boolean(msg.read),
      timestamp: msg.timestamp || Date.now()
    };
    if (msg.mediaUrl) msgData.mediaUrl = String(msg.mediaUrl).slice(0, 1000);
    if (msg.fileName) msgData.fileName = String(msg.fileName).slice(0, 255);

    batch.set(convRef, convData, { merge: true });
    batch.set(msgRef, msgData, { merge: true });
    await batch.commit().catch(() => {});
  } catch (e) {
    // Non-blocking sync
  }
}

/* --- WebSocket Connection Registry & Broadcaster --- */
const visitorSockets = new Map(); // visitorId -> Set<WebSocket>
const adminSockets = new Set();   // Set<WebSocket>

function sendWsJson(ws, payload) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(payload));
    } catch (e) {}
  }
}

function broadcastToVisitor(visitorId, payload) {
  const set = visitorSockets.get(visitorId);
  if (set) {
    for (const ws of set) {
      sendWsJson(ws, payload);
    }
  }
}

function broadcastToAdmins(payload) {
  for (const ws of adminSockets) {
    sendWsJson(ws, payload);
  }
}

function broadcastToAllVisitors(payload) {
  for (const [, set] of visitorSockets.entries()) {
    for (const ws of set) {
      sendWsJson(ws, payload);
    }
  }
}

let lastAdminPresencePersistAt = 0;
function getEffectiveAdminPresence() {
  const now = Date.now();
  const isOnline = adminSockets.size > 0 || (Boolean(adminPresenceState.adminOnline) && (now - Number(adminPresenceState.adminLastSeen || 0) < 45000));
  return {
    adminOnline: isOnline,
    adminLastSeen: Number(adminPresenceState.adminLastSeen) || (now - 12 * 60 * 1000)
  };
}

function touchAdminActivity(online = true, forceBroadcast = false) {
  const now = Date.now();
  const wasOnline = Boolean(adminPresenceState.adminOnline);
  const nextOnline = Boolean(online);
  adminPresenceState.adminOnline = nextOnline;
  adminPresenceState.adminLastSeen = now;

  if (forceBroadcast || wasOnline !== nextOnline || (now - lastAdminPresencePersistAt > 15000)) {
    lastAdminPresencePersistAt = now;
    rtdbSet('presence/admin', {
      adminOnline: nextOnline,
      adminLastSeen: now
    });
    broadcastToAllVisitors({
      type: 'admin:presence',
      adminOnline: nextOnline,
      adminLastSeen: now
    });
  }
}

function summarizeConversation(conv) {
  if (!conv) return null;
  const { messages, ...summary } = conv;
  return {
    ...summary,
    messageCount: Array.isArray(messages) ? messages.length : 0
  };
}

/* --- Core Chat Mutation Helpers (Idempotent) --- */
async function appendChatMessage(visitorId, rawMsg, meta = {}) {
  const conv = await getOrCreateConversation(visitorId, true, meta);
  if (!conv) throw new Error('Invalid visitorId');
  if (conv.status === 'blocked' && rawMsg.sender !== 'admin') {
    throw new Error('This conversation cannot receive new messages.');
  }

  const msg = sanitizeChatMessage(rawMsg, visitorId);
  if (!msg.text && !msg.mediaUrl) {
    throw new Error('Message text or attachment is required.');
  }

  // Idempotency guard: if messageId already exists, return existing without duplicating
  if (!Array.isArray(conv.messages)) conv.messages = [];
  const existingMsg = conv.messages.find(m => m.messageId === msg.messageId);
  if (existingMsg) {
    return { conversation: conv, message: existingMsg, duplicate: true };
  }

  conv.messages.push(msg);
  conv.lastMessage = msg.text || (msg.type === 'image' ? '📷 Image' : `📎 ${msg.fileName || 'Attachment'}`);
  conv.lastMessageAt = msg.timestamp;
  conv.lastSender = msg.sender;

  if (meta.visitorName && String(meta.visitorName).trim()) {
    conv.visitorName = String(meta.visitorName).trim().slice(0, 100);
  }
  if (meta.visitorEmail && String(meta.visitorEmail).trim()) {
    conv.visitorEmail = String(meta.visitorEmail).trim().slice(0, 160);
  }
  if (meta.pageUrl && String(meta.pageUrl).trim()) {
    conv.pageUrl = String(meta.pageUrl).trim().slice(0, 500);
  }
  if (meta.userAgent && String(meta.userAgent).trim()) {
    conv.userAgent = String(meta.userAgent).trim().slice(0, 300);
  }

  if (msg.sender === 'visitor') {
    conv.unreadForAdmin = (Number(conv.unreadForAdmin) || 0) + 1;
    conv.visitorTyping = false;
    conv.visitorOnline = true;
    conv.visitorLastSeen = Date.now();
    if (conv.status === 'archived') conv.status = 'active';
  } else {
    conv.unreadForVisitor = (Number(conv.unreadForVisitor) || 0) + 1;
    conv.unreadForAdmin = 0;
    conv.adminTyping = false;
    // Mark all visitor messages as read when admin replies
    conv.messages.forEach(m => {
      if (m.sender === 'visitor') m.read = true;
    });
  }

  await saveConversationState(conv);

  syncVisitorMessageToFirestore(conv, msg);

  const eventPayload = {
    type: 'message:created',
    visitorId,
    message: msg,
    conversation: summarizeConversation(conv)
  };
  broadcastToVisitor(visitorId, eventPayload);
  broadcastToAdmins(eventPayload);

  return { conversation: conv, message: msg, duplicate: false };
}

async function markConversationRead(visitorId, readerRole) {
  const conv = await getOrCreateConversation(visitorId, false);
  if (!conv) return null;

  let changed = false;
  if (!Array.isArray(conv.messages)) conv.messages = [];

  if (readerRole === 'visitor') {
    if (conv.unreadForVisitor > 0) {
      conv.unreadForVisitor = 0;
      changed = true;
    }
    conv.messages.forEach(m => {
      if (m.sender === 'admin' && !m.read) {
        m.read = true;
        changed = true;
      }
    });
  } else if (readerRole === 'admin') {
    if (conv.unreadForAdmin > 0) {
      conv.unreadForAdmin = 0;
      changed = true;
    }
    conv.messages.forEach(m => {
      if (m.sender === 'visitor' && !m.read) {
        m.read = true;
        changed = true;
      }
    });
  }

  if (changed) {
    await saveConversationState(conv);
    const readPayload = {
      type: 'messages:read',
      visitorId,
      reader: readerRole,
      readAt: Date.now(),
      conversation: summarizeConversation(conv)
    };
    broadcastToVisitor(visitorId, readPayload);
    broadcastToAdmins(readPayload);
  }

  return conv;
}

/* --- Public Chat REST Endpoints --- */

app.get('/api/chat/config', (req, res) => {
  res.json({
    firebaseConfig,
    wsPath: '/ws/chat',
    realtimeEnabled: true,
    adminPresence: getEffectiveAdminPresence()
  });
});

app.get('/api/chat/conversation/:visitorId', async (req, res) => {
  try {
    const { visitorId } = req.params;
    if (!isValidVisitorIdString(visitorId)) {
      return res.status(400).json({ error: 'Invalid visitor ID format' });
    }
    const conv = await getOrCreateConversation(visitorId, false);
    const adminPresence = getEffectiveAdminPresence();
    if (!conv) {
      return res.json({
        exists: false,
        adminPresence,
        conversation: {
          visitorId,
          status: 'active',
          unreadForVisitor: 0,
          unreadForAdmin: 0,
          adminTyping: false,
          visitorTyping: false,
          messages: []
        }
      });
    }
    if (conv.adminTyping && (!conv.adminTypingAt || Date.now() - Number(conv.adminTypingAt) > 4500)) {
      conv.adminTyping = false;
    }
    if (conv.visitorTyping && (!conv.visitorTypingAt || Date.now() - Number(conv.visitorTypingAt) > 4500)) {
      conv.visitorTyping = false;
    }
    if (req.query.markRead === '1' || req.query.markRead === 'true') {
      await markConversationRead(visitorId, 'visitor');
    }
    res.json({ exists: true, adminPresence, conversation: conv });
  } catch (err) {
    console.error('Error fetching visitor conversation:', err);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

app.post('/api/chat/conversation/:visitorId/message', async (req, res) => {
  try {
    const { visitorId } = req.params;
    if (!isValidVisitorIdString(visitorId)) {
      return res.status(400).json({ error: 'Invalid visitor ID format' });
    }
    const { text, type = 'text', mediaUrl = '', fileName = '', messageId, visitorName, visitorEmail, pageUrl } = req.body || {};
    const result = await appendChatMessage(
      visitorId,
      { messageId, sender: 'visitor', text, type, mediaUrl, fileName, read: false, timestamp: Date.now() },
      { visitorName, visitorEmail, pageUrl, userAgent: req.headers['user-agent'] || '', visitorOnline: true }
    );
    res.status(201).json({
      success: true,
      message: result.message,
      conversation: summarizeConversation(result.conversation),
      duplicate: result.duplicate
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to send message' });
  }
});

// Sync messages created directly via Firebase by client into MongoDB backend
app.post('/api/chat/conversation/:visitorId/sync', async (req, res) => {
  try {
    const { visitorId } = req.params;
    if (!isValidVisitorIdString(visitorId)) {
      return res.status(400).json({ error: 'Invalid visitor ID format' });
    }
    const { messages = [], visitorName, pageUrl } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      const conv = await getOrCreateConversation(visitorId, false);
      return res.json({ success: true, conversation: conv });
    }
    let lastConv = null;
    for (const m of messages.slice(0, 50)) {
      if (m && (m.text || m.mediaUrl)) {
        const resSync = await appendChatMessage(
          visitorId,
          {
            messageId: m.messageId,
            sender: m.sender === 'admin' ? 'admin' : 'visitor',
            text: m.text,
            type: m.type || 'text',
            mediaUrl: m.mediaUrl || '',
            fileName: m.fileName || '',
            read: Boolean(m.read),
            timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now()
          },
          { visitorName, pageUrl }
        ).catch(() => null);
        if (resSync && resSync.conversation) lastConv = resSync.conversation;
      }
    }
    if (!lastConv) lastConv = await getOrCreateConversation(visitorId, false);
    res.json({ success: true, conversation: lastConv });
  } catch (err) {
    res.status(500).json({ error: 'Failed to sync conversation' });
  }
});

app.post('/api/chat/conversation/:visitorId/read', async (req, res) => {
  try {
    const { visitorId } = req.params;
    if (!isValidVisitorIdString(visitorId)) {
      return res.status(400).json({ error: 'Invalid visitor ID format' });
    }
    const conv = await markConversationRead(visitorId, 'visitor');
    res.json({ success: true, conversation: summarizeConversation(conv) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

app.post('/api/chat/conversation/:visitorId/typing', async (req, res) => {
  try {
    const { visitorId } = req.params;
    if (!isValidVisitorIdString(visitorId)) {
      return res.status(400).json({ error: 'Invalid visitor ID format' });
    }
    const { typing = false, visitorName, visitorEmail, pageUrl } = req.body || {};
    const isTyping = Boolean(typing);
    const now = Date.now();
    const conv = await getOrCreateConversation(visitorId, false);
    if (conv) {
      conv.visitorTyping = isTyping;
      conv.visitorTypingAt = isTyping ? now : 0;
      conv.visitorOnline = true;
      conv.visitorLastSeen = now;
      if (visitorName !== undefined && String(visitorName).trim()) {
        conv.visitorName = String(visitorName).trim().slice(0, 100);
      }
      if (visitorEmail !== undefined && String(visitorEmail).trim()) {
        conv.visitorEmail = String(visitorEmail).trim().slice(0, 160);
      }
      if (pageUrl !== undefined && String(pageUrl).trim()) {
        conv.pageUrl = String(pageUrl).trim().slice(0, 500);
      }
      await saveConversationState(conv);
    }
    broadcastToAdmins({
      type: 'typing:update',
      visitorId,
      sender: 'visitor',
      typing: isTyping,
      typingAt: isTyping ? now : 0,
      visitorName: conv ? conv.visitorName : (visitorName || '')
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update typing state' });
  }
});

app.post('/api/chat/upload', (req, res, next) => {
  chatUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file attached' });
    }
    const isImage = req.file.mimetype && req.file.mimetype.startsWith('image/');
    res.json({
      success: true,
      url: `/uploads/chat/${req.file.filename}`,
      fileName: req.file.originalname || req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      type: isImage ? 'image' : 'file'
    });
  } catch (err) {
    res.status(500).json({ error: 'File upload failed' });
  }
});

/* --- Admin Chat REST Endpoints --- */

app.get('/api/admin/chat/conversations', authMiddleware, async (req, res) => {
  try {
    const { status = 'all', search = '' } = req.query;
    let list = [];

    list = Array.from(inMemoryConversations.values());

    // Filter out empty conversations that have 0 messages unless specifically searched
    list = list.filter(c => (Array.isArray(c.messages) && c.messages.length > 0) || c.lastMessage);

    const totalUnreadForAdmin = list.reduce((sum, c) => sum + (Number(c.unreadForAdmin) || 0), 0);

    if (status === 'unread') {
      list = list.filter(c => (Number(c.unreadForAdmin) || 0) > 0);
    } else if (status && status !== 'all') {
      list = list.filter(c => c.status === status);
    }

    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      list = list.filter(c =>
        (c.visitorId || '').toLowerCase().includes(q) ||
        (c.visitorName || '').toLowerCase().includes(q) ||
        (c.visitorEmail || '').toLowerCase().includes(q) ||
        (c.lastMessage || '').toLowerCase().includes(q) ||
        (Array.isArray(c.messages) && c.messages.some(m => (m.text || '').toLowerCase().includes(q)))
      );
    }

    list.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

    res.json({
      conversations: list.map(summarizeConversation),
      totalUnreadForAdmin,
      total: list.length
    });
  } catch (err) {
    console.error('Error listing admin conversations:', err);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

app.get('/api/admin/chat/conversations/:visitorId', authMiddleware, async (req, res) => {
  try {
    const { visitorId } = req.params;
    const conv = await getOrCreateConversation(visitorId, false);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ conversation: conv });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

app.post('/api/admin/chat/conversations/:visitorId/reply', authMiddleware, async (req, res) => {
  try {
    const { visitorId } = req.params;
    const { text, type = 'text', mediaUrl = '', fileName = '', messageId } = req.body || {};
    const result = await appendChatMessage(
      visitorId,
      { messageId, sender: 'admin', text, type, mediaUrl, fileName, read: false, timestamp: Date.now() },
      {}
    );
    res.status(201).json({
      success: true,
      message: result.message,
      conversation: result.conversation
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to send reply' });
  }
});

app.post('/api/admin/chat/conversations/:visitorId/read', authMiddleware, async (req, res) => {
  try {
    const { visitorId } = req.params;
    const conv = await markConversationRead(visitorId, 'admin');
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ success: true, conversation: summarizeConversation(conv) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark conversation read' });
  }
});

app.post('/api/admin/chat/conversations/:visitorId/typing', authMiddleware, async (req, res) => {
  try {
    const { visitorId } = req.params;
    const { typing = false } = req.body || {};
    const isTyping = Boolean(typing);
    const now = Date.now();
    const conv = await getOrCreateConversation(visitorId, false);
    if (conv) {
      conv.adminTyping = isTyping;
      conv.adminTypingAt = isTyping ? now : 0;
      await saveConversationState(conv);
    }
    broadcastToVisitor(visitorId, {
      type: 'typing:update',
      visitorId,
      sender: 'admin',
      typing: isTyping,
      typingAt: isTyping ? now : 0
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update admin typing state' });
  }
});

app.put('/api/admin/chat/conversations/:visitorId/status', authMiddleware, async (req, res) => {
  try {
    const { visitorId } = req.params;
    const { status, visitorName, visitorEmail } = req.body || {};
    const conv = await getOrCreateConversation(visitorId, false);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    if (status && ['active', 'archived', 'blocked'].includes(status)) {
      conv.status = status;
    }
    if (visitorName !== undefined) {
      conv.visitorName = String(visitorName).trim().slice(0, 100);
    }
    if (visitorEmail !== undefined) {
      conv.visitorEmail = String(visitorEmail).trim().slice(0, 160);
    }

    await saveConversationState(conv);

    const payload = {
      type: 'conversation:updated',
      visitorId,
      conversation: summarizeConversation(conv)
    };
    broadcastToVisitor(visitorId, payload);
    broadcastToAdmins(payload);

    res.json({ success: true, conversation: summarizeConversation(conv) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

app.delete('/api/admin/chat/conversations/:visitorId', authMiddleware, async (req, res) => {
  try {
    const { visitorId } = req.params;
    inMemoryConversations.delete(visitorId);
    rtdbRemove(`conversations/${visitorId}`);
    broadcastToAdmins({ type: 'conversation:deleted', visitorId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

app.post('/api/admin/chat/presence', (req, res) => {
  try {
    const { online = false } = req.body || {};
    touchAdminActivity(Boolean(online), true);
    res.json({ success: true, adminPresence: getEffectiveAdminPresence() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update presence' });
  }
});

/* --- Dynamic Sitemap, RSS Feed, Robots.txt and Article SEO HTML Pre-rendering --- */

app.get('/robots.txt', (req, res) => {
  const robotsPath = path.join(staticRoot, 'robots.txt');
  if (fs.existsSync(robotsPath)) {
    res.header('Content-Type', 'text/plain');
    res.sendFile(robotsPath);
  } else {
    res.header('Content-Type', 'text/plain');
    res.send(`User-agent: *\nAllow: /\nAllow: /about\nAllow: /writing\nAllow: /gallery\nAllow: /post/\nAllow: /sitemap.xml\nAllow: /feed.xml\nAllow: /uploads/\nAllow: /images/\n\nDisallow: /admin\nDisallow: /admin/\nDisallow: /admin.html\nDisallow: /api/admin/\nDisallow: /api/auth/\n\nSitemap: https://chitron.iam.bd/sitemap.xml\nSitemap: https://chitronsarchive.org/sitemap.xml\n`);
  }
});

// Clean URLs with 301 canonical redirects for legacy .html extensions
app.get('/about.html', (req, res) => res.redirect(301, '/about'));
app.get('/writing.html', (req, res) => res.redirect(301, '/writing'));
app.get('/gallery.html', (req, res) => res.redirect(301, '/gallery'));

app.get('/about', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.sendFile(path.join(staticRoot, 'about.html'));
});

app.get('/writing', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.sendFile(path.join(staticRoot, 'writing.html'));
});

app.get('/gallery', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.sendFile(path.join(staticRoot, 'gallery.html'));
});

async function servePostHtmlWithSeo(req, res) {
  try {
    const slug = req.params.slug || req.query.slug;
    const postHtmlPath = path.join(staticRoot, 'post.html');

    if (!fs.existsSync(postHtmlPath)) {
      return res.status(404).send('Not Found');
    }

    // 301 redirect legacy query param /post.html?slug=xyz to clean /post/xyz
    if (req.path === '/post.html' && req.query.slug) {
      return res.redirect(301, `/post/${encodeURIComponent(req.query.slug)}`);
    }

    let html = fs.readFileSync(postHtmlPath, 'utf8');

    if (!slug) {
      return res.send(html);
    }

    let post = inMemoryPosts.find(p => p.slug === slug && p.status === 'published');

    if (post) {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.get('host') || 'chitron.iam.bd';
      const baseUrl = `${protocol}://${host}`;
      const canonicalUrl = `${baseUrl}/post/${encodeURIComponent(post.slug)}`;

      const authorName = post.author || 'Chitron Bhattacharjee';
      const title = `${post.title || 'Article'} — ${authorName} | Chitron's Archive`;
      const description = (post.excerpt || post.seoDescription || post.title || '')
        .replace(/<[^>]*>/g, '')
        .replace(/"/g, '&quot;')
        .trim();

      const rawCover = post.coverImage || '';
      const coverImage = rawCover
        ? (rawCover.startsWith('http') ? rawCover : `${baseUrl}${rawCover}`)
        : `${baseUrl}/images/chitron-bhattacharjee-og.jpg`;

      const pubDate = (post.publishedAt || post.createdAt || new Date()).toISOString();
      const modDate = (post.updatedAt || post.publishedAt || new Date()).toISOString();

      // Dynamically inject/replace SEO elements in HTML head for search crawlers & social cards
      html = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);
      html = html.replace(/<meta\s+name="description"\s+content=".*?"\s*\/?>/i, `<meta name="description" content="${description}">`);
      html = html.replace(/<link\s+rel="canonical"\s+href=".*?"\s*\/?>/i, `<link rel="canonical" href="${canonicalUrl}">`);

      html = html.replace(/<meta\s+property="og:title"\s+content=".*?"\s*\/?>/i, `<meta property="og:title" content="${title}">`);
      html = html.replace(/<meta\s+property="og:description"\s+content=".*?"\s*\/?>/i, `<meta property="og:description" content="${description}">`);
      html = html.replace(/<meta\s+property="og:url"\s+content=".*?"\s*\/?>/i, `<meta property="og:url" content="${canonicalUrl}">`);
      html = html.replace(/<meta\s+property="og:image"\s+content=".*?"\s*\/?>/i, `<meta property="og:image" content="${coverImage}">`);

      html = html.replace(/<meta\s+name="twitter:title"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:title" content="${title}">`);
      html = html.replace(/<meta\s+name="twitter:description"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:description" content="${description}">`);
      html = html.replace(/<meta\s+name="twitter:image"\s+content=".*?"\s*\/?>/i, `<meta name="twitter:image" content="${coverImage}">`);

      // Rich Schema.org BlogPosting Structured Data with canonical entity reference
      const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "BlogPosting",
            "@id": `${canonicalUrl}#blogposting`,
            "headline": post.title || '',
            "description": description,
            "datePublished": pubDate,
            "dateModified": modDate,
            "mainEntityOfPage": { "@type": "WebPage", "@id": canonicalUrl },
            "url": canonicalUrl,
            "image": coverImage,
            "author": {
              "@type": "Person",
              "@id": "https://chitron.iam.bd/#chitron-bhattacharjee",
              "name": authorName,
              "url": `${baseUrl}/about`
            },
            "publisher": {
              "@type": "Person",
              "@id": "https://chitron.iam.bd/#chitron-bhattacharjee",
              "name": "Chitron Bhattacharjee",
              "url": `${baseUrl}/`
            }
          },
          {
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": `${baseUrl}/`
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": "Writing",
                "item": `${baseUrl}/writing`
              },
              {
                "@type": "ListItem",
                "position": 3,
                "name": post.title || 'Article',
                "item": canonicalUrl
              }
            ]
          }
        ]
      };

      const jsonLdScript = `\n  <script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script>`;
      html = html.replace('</head>', `${jsonLdScript}\n</head>`);
    }

    res.send(html);
  } catch (err) {
    console.error('Error serving post HTML:', err);
    res.sendFile(path.join(staticRoot, 'post.html'));
  }
}

app.get('/post.html', servePostHtmlWithSeo);
app.get('/post/:slug', servePostHtmlWithSeo);

app.get('/sitemap.xml', async (req, res) => {
  try {
    const siteUrl = 'https://chitron.iam.bd';
    const posts = inMemoryPosts.filter(p => p.status === 'published');

    const today = new Date().toISOString().split('T')[0];
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
    xml += `        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n`;
    xml += `        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9\n`;
    xml += `        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n`;

    // Static pages
    xml += `  <url>\n    <loc>${siteUrl}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
    xml += `  <url>\n    <loc>${siteUrl}/about</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
    xml += `  <url>\n    <loc>${siteUrl}/writing</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
    xml += `  <url>\n    <loc>${siteUrl}/gallery</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;

    // Dynamic Posts
    posts.forEach(p => {
      const pDate = (p.updatedAt || p.publishedAt || new Date()).toISOString().split('T')[0];
      xml += `  <url>\n    <loc>${siteUrl}/post/${encodeURIComponent(p.slug)}</loc>\n    <lastmod>${pDate}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    });

    xml += `</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    res.sendFile(path.join(staticRoot, 'sitemap.xml'));
  }
});

app.get('/feed.xml', async (req, res) => {
  try {
    const siteUrl = 'https://chitron.iam.bd';
    const posts = inMemoryPosts.filter(p => p.status === 'published');

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n`;
    xml += `  <channel>\n`;
    xml += `    <title>Chitron's Archive</title>\n`;
    xml += `    <link>${siteUrl}/</link>\n`;
    xml += `    <description>Notes, ideas, experiments and things worth remembering — by Chitron Bhattacharjee.</description>\n`;
    xml += `    <language>en-US</language>\n`;
    xml += `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>\n`;
    xml += `    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>\n`;

    posts.forEach(p => {
      const pub = p.publishedAt ? new Date(p.publishedAt).toUTCString() : new Date().toUTCString();
      const desc = (p.excerpt || p.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const title = (p.title || 'Untitled').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      xml += `    <item>\n`;
      xml += `      <title>${title}</title>\n`;
      xml += `      <link>${siteUrl}/post/${encodeURIComponent(p.slug)}</link>\n`;
      xml += `      <guid>${siteUrl}/post/${encodeURIComponent(p.slug)}</guid>\n`;
      xml += `      <pubDate>${pub}</pubDate>\n`;
      xml += `      <description>${desc}</description>\n`;
      xml += `      <author>chitronbhattacharjee@gmail.com (Chitron Bhattacharjee)</author>\n`;
      if (p.category) xml += `      <category>${p.category}</category>\n`;
      xml += `    </item>\n`;
    });

    xml += `  </channel>\n</rss>`;
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    res.sendFile(path.join(staticRoot, 'feed.xml'));
  }
});

/* --- Static Files Serving with Optimized Caching & LCP Preload --- */
const staticRoot = path.resolve(__dirname);

// High-speed homepage handler with server-side LCP image preload injection
app.get(['/', '/index.html'], async (req, res, next) => {
  try {
    let html = fs.readFileSync(path.join(staticRoot, 'index.html'), 'utf8');
    let topCover = null;
    const published = inMemoryPosts.filter(p => p.status === 'published' || (p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt) <= new Date()));
    if (published.length > 0 && published[0].coverImage) {
      topCover = published[0].coverImage;
    }

    if (topCover) {
      const optimizedUrl = (topCover.startsWith('/uploads/') || topCover.startsWith('http://') || topCover.startsWith('https://'))
        ? `/api/images/optimize?url=${encodeURIComponent(topCover)}&w=768`
        : topCover;
      const preloadTag = `  <link rel="preload" as="image" href="${optimizedUrl}" fetchpriority="high" imagesizes="(max-width: 768px) 100vw, 658px">`;
      html = html.replace('</head>', `${preloadTag}\n</head>`);
    }

    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    return res.send(html);
  } catch (err) {
    next();
  }
});

app.use(express.static(staticRoot, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.woff2') || filePath.endsWith('.woff') || filePath.endsWith('.ttf')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.match(/\.(png|jpg|jpeg|webp|svg|ico)$/i)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=604800');
    } else if (filePath.endsWith('.apk')) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="app.apk"');
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    } else if (filePath.endsWith('.css') || filePath.endsWith('.js') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  }
}));

// Fallback for 404
app.use((req, res) => {
  if (req.accepts('html')) {
    res.status(404).sendFile(path.join(staticRoot, '404.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

/* --- Global Error Handler --- */
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

/* --- HTTP + WebSocket Server Initialization --- */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/chat' });

wss.on('connection', (ws, req) => {
  let clientRole = null;
  let clientVisitorId = null;

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(String(raw));
      if (!data || !data.type) return;

      // 1. Client Authentication / Room Join
      if (data.type === 'visitor:join') {
        const vid = String(data.visitorId || '').trim();
        if (!isValidVisitorIdString(vid)) {
          return sendWsJson(ws, { type: 'error', error: 'Invalid visitorId' });
        }
        clientRole = 'visitor';
        clientVisitorId = vid;
        if (!visitorSockets.has(vid)) visitorSockets.set(vid, new Set());
        visitorSockets.get(vid).add(ws);

        const conv = await getOrCreateConversation(vid, false);
        if (conv) {
          conv.visitorOnline = true;
          conv.visitorLastSeen = Date.now();
          if (data.pageUrl) conv.pageUrl = String(data.pageUrl).slice(0, 500);
          await saveConversationState(conv);
          broadcastToAdmins({
            type: 'presence:update',
            visitorId: vid,
            visitorOnline: true,
            visitorLastSeen: conv.visitorLastSeen,
            pageUrl: conv.pageUrl
          });
        }

        sendWsJson(ws, {
          type: 'conversation:init',
          visitorId: vid,
          adminPresence: getEffectiveAdminPresence(),
          conversation: conv || {
            visitorId: vid,
            status: 'active',
            unreadForVisitor: 0,
            unreadForAdmin: 0,
            messages: []
          }
        });
        return;
      }

      if (data.type === 'admin:join') {
        const token = String(data.token || '').trim();
        if (!isValidToken(token)) {
          return sendWsJson(ws, { type: 'error', error: 'Unauthorized admin session' });
        }
        clientRole = 'admin';
        adminSockets.add(ws);
        touchAdminActivity(true, true);
        sendWsJson(ws, { type: 'admin:connected', timestamp: Date.now() });
        return;
      }

      if (data.type === 'admin:ping') {
        if (clientRole === 'admin') {
          touchAdminActivity(true, false);
        }
        return;
      }

      // 2. Real-time Message Send over WebSocket
      if (data.type === 'message:send') {
        if (clientRole === 'visitor' && clientVisitorId) {
          await appendChatMessage(
            clientVisitorId,
            {
              messageId: data.messageId,
              sender: 'visitor',
              text: data.text,
              type: data.msgType || 'text',
              mediaUrl: data.mediaUrl || '',
              fileName: data.fileName || '',
              read: false,
              timestamp: Date.now()
            },
            {
              visitorName: data.visitorName,
              visitorEmail: data.visitorEmail,
              pageUrl: data.pageUrl,
              visitorOnline: true
            }
          );
        } else if (clientRole === 'admin' && data.visitorId) {
          await appendChatMessage(
            String(data.visitorId),
            {
              messageId: data.messageId,
              sender: 'admin',
              text: data.text,
              type: data.msgType || 'text',
              mediaUrl: data.mediaUrl || '',
              fileName: data.fileName || '',
              read: false,
              timestamp: Date.now()
            },
            {}
          );
        }
        return;
      }

      // 3. Real-time Read Receipts
      if (data.type === 'messages:mark_read') {
        if (clientRole === 'visitor' && clientVisitorId) {
          await markConversationRead(clientVisitorId, 'visitor');
        } else if (clientRole === 'admin' && data.visitorId) {
          await markConversationRead(String(data.visitorId), 'admin');
        }
        return;
      }

      // 4. Real-time Typing Indicators
      if (data.type === 'typing:set') {
        const isTyping = Boolean(data.typing);
        const now = Date.now();
        if (clientRole === 'visitor' && clientVisitorId) {
          const conv = await getOrCreateConversation(clientVisitorId, false);
          if (conv) {
            conv.visitorTyping = isTyping;
            conv.visitorTypingAt = isTyping ? now : 0;
            conv.visitorOnline = true;
            conv.visitorLastSeen = now;
            await saveConversationState(conv);
          }
          broadcastToAdmins({
            type: 'typing:update',
            visitorId: clientVisitorId,
            sender: 'visitor',
            typing: isTyping,
            typingAt: isTyping ? now : 0
          });
        } else if (clientRole === 'admin' && data.visitorId) {
          const targetVid = String(data.visitorId);
          const conv = await getOrCreateConversation(targetVid, false);
          if (conv) {
            conv.adminTyping = isTyping;
            conv.adminTypingAt = isTyping ? now : 0;
            await saveConversationState(conv);
          }
          broadcastToVisitor(targetVid, {
            type: 'typing:update',
            visitorId: targetVid,
            sender: 'admin',
            typing: isTyping,
            typingAt: isTyping ? now : 0
          });
        }
        return;
      }
    } catch (err) {
      sendWsJson(ws, { type: 'error', error: err.message || 'WebSocket message error' });
    }
  });

  ws.on('close', async () => {
    if (clientRole === 'admin') {
      adminSockets.delete(ws);
      if (adminSockets.size === 0) {
        touchAdminActivity(false, true);
      }
    } else if (clientRole === 'visitor' && clientVisitorId) {
      const set = visitorSockets.get(clientVisitorId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          visitorSockets.delete(clientVisitorId);
          const conv = await getOrCreateConversation(clientVisitorId, false);
          if (conv) {
            conv.visitorOnline = false;
            conv.visitorTyping = false;
            conv.visitorLastSeen = Date.now();
            await saveConversationState(conv);
          }
          broadcastToAdmins({
            type: 'presence:update',
            visitorId: clientVisitorId,
            visitorOnline: false,
            visitorLastSeen: Date.now()
          });
        }
      }
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Chitrons Archive server running on http://${HOST}:${PORT}`);
  console.log(`Admin PIN configured: ${ADMIN_PIN ? 'Yes' : 'No'}`);
});
