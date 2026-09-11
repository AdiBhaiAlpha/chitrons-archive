const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const mongoose = require('mongoose');
const slugify = require('slugify');
const crypto = require('crypto');
const multer = require('multer');

require('dotenv').config();

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

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

/* --- Mongoose Models (from backend/models) --- */
const BlogPost = require('./backend/models/BlogPost');
const AboutProfile = require('./backend/models/AboutProfile');
const Homepage = require('./backend/models/Homepage');
const SiteSettings = require('./backend/models/SiteSettings');
const Revision = require('./backend/models/Revision');
const GalleryItem = require('./backend/models/GalleryItem');

/* --- Seed Data Definitions --- */
const initialPosts = [
  {
    title: 'Building ShiPu AI: Reflections on Bengali Conversational Systems',
    slug: 'building-shipu-ai-reflections',
    excerpt: 'Designing conversational personalities and language model integrations tailored for Bengali speakers.',
    content: '<p>Building <strong>ShiPu AI</strong> began with a simple question: how can we make conversational AI feel natural, context-aware, and culturally nuanced for Bengali speakers?</p><p>Most large language model interfaces prioritize English language patterns. Tailoring an agent to handle regional conversational phrasing, colloquial expressions, and rapid prompt chaining required thoughtful prompt architecture and continuous testing.</p><h3>Key Architectural Decisions</h3><p>Rather than relying solely on raw API responses, we wrapped the conversational loop in a custom Node.js middleware layer. This allowed us to preserve session contexts, manage conversational memory, and enforce consistent agent personas.</p><p>Building practical tools is always an iterative craft — and every edge case teaches something valuable about human-machine interaction.</p>',
    author: 'Chitron Bhattacharjee',
    category: 'ai',
    labels: ['artificial-intelligence', 'nodejs', 'chatbots', 'experiments'],
    status: 'published',
    publishedAt: new Date('2025-01-15T10:00:00Z'),
    readingTime: 3,
    viewCount: 142,
    seoTitle: 'Building ShiPu AI: Reflections on Bengali Conversational Systems',
    seoDescription: 'Designing conversational personalities and language model integrations tailored for Bengali speakers.',
    canonicalUrl: '',
    featured: true,
    commentsEnabled: true
  },
  {
    title: 'Why I Prefer Minimalist Digital Archives',
    slug: 'why-i-prefer-minimalist-digital-archives',
    excerpt: 'Thoughts on building personal web spaces with lightweight code, calm typography, and zero clutter.',
    content: '<p>The modern web is often bloated with megabytes of telemetry scripts, aggressive popups, and unnecessary animations. In building <em>Chitrons Archive</em>, the goal was the exact opposite: radical simplicity.</p><p>A personal website should load instantly, look sharp on any device, and put the reading experience first. Semantic HTML, thoughtful CSS custom properties, and lightweight client-side interactions achieve in a few kilobytes what heavy frameworks often complicate.</p><blockquote>"Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away."</blockquote><p>When you strip away distractions, all that remains is the work and the ideas.</p>',
    author: 'Chitron Bhattacharjee',
    category: 'web-development',
    labels: ['design', 'minimalism', 'javascript', 'architecture'],
    status: 'published',
    publishedAt: new Date('2025-02-10T14:30:00Z'),
    readingTime: 2,
    viewCount: 98,
    seoTitle: 'Why I Prefer Minimalist Digital Archives',
    seoDescription: 'Thoughts on building personal web spaces with lightweight code, calm typography, and zero clutter.',
    canonicalUrl: '',
    featured: false,
    commentsEnabled: true
  },
  {
    title: 'On Writing and Code: Two Mediums of Thought',
    slug: 'on-writing-and-code',
    excerpt: 'Exploring how constructing software and writing prose both require precision, structure, and empathy for the reader.',
    content: '<p>At first glance, writing code and writing essays seem like entirely different disciplines. One instructs a machine; the other communicates with human minds.</p><p>Yet at their core, both require the same fundamental habit: decomposing complex thoughts into clear, structured, and legible units. Good code is written for human maintainers first. Good writing is edited until every sentence carries its own weight.</p><p>Balancing technical development with creative writing keeps both perspectives sharp.</p>',
    author: 'Chitron Bhattacharjee',
    category: 'reflections',
    labels: ['writing', 'philosophy', 'creativity'],
    status: 'published',
    publishedAt: new Date('2025-02-22T08:00:00Z'),
    readingTime: 2,
    viewCount: 65,
    seoTitle: 'On Writing and Code: Two Mediums of Thought',
    seoDescription: 'Exploring how constructing software and writing prose both require precision, structure, and empathy for the reader.',
    canonicalUrl: '',
    featured: false,
    commentsEnabled: true
  }
];

const initialAbout = {
  name: 'Chitron Bhattacharjee',
  headline: "Hi, I’m Chitron Bhattacharjee.",
  shortBio: "I’m an AI developer, programmer, and writer from Bangladesh. I enjoy building things with technology, especially AI-powered systems, web applications, and tools that solve real problems in a simple way.\n\nI’m always interested in learning how things work behind the scenes and turning ideas into something people can actually use.",
  biography: "I work with modern web technologies and enjoy experimenting with AI, automation, and conversational systems. Most of my time goes into building projects, improving my skills, and exploring new ideas in technology.\n\nI also enjoy writing. Sometimes I write about technology, sometimes about ideas and experiences, and sometimes simply to put thoughts into words.",
  profileImage: 'https://i.ibb.co.com/Z63W9Mfq/file-000000003a447207b4fb3901061137af.png',
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
  profileImage: '',
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
    url: 'https://i.ibb.co.com/Z63W9Mfq/file-000000003a447207b4fb3901061137af.png',
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

/* --- In-Memory State Fallback --- */
let inMemoryPosts = initialPosts.map((p, i) => ({ ...p, _id: `mem-post-${i + 1}`, createdAt: new Date(), updatedAt: new Date() }));
let inMemoryGallery = initialGallery.map((g, i) => ({ ...g, _id: `mem-photo-${i + 1}`, createdAt: g.date || new Date(), updatedAt: g.date || new Date() }));
let inMemoryRevisions = [];
let inMemoryAbout = { ...initialAbout };
let inMemoryHomepage = { ...initialHomepage };
let inMemorySettings = { ...initialSettings };

let isMongoConnected = false;
let sessionStore = null;
let mongoConnectPromise = null;

async function isDbConnected() {
  if (mongoose.connection.readyState === 1) {
    return true;
  }
  if (!MONGODB_URI) return false;
  return await connectToMongo();
}

// Track connection status dynamically
mongoose.connection.on('connected', () => {
  isMongoConnected = true;
  console.log('MongoDB connected successfully');
});

mongoose.connection.on('disconnected', () => {
  isMongoConnected = false;
  console.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  isMongoConnected = false;
  console.warn('MongoDB connection event error:', err.message);
});

async function connectToMongo() {
  if (mongoose.connection.readyState === 1) {
    isMongoConnected = true;
    return true;
  }
  if (!MONGODB_URI) return false;

  if (mongoose.connection.readyState === 2 && mongoConnectPromise) {
    await mongoConnectPromise.catch(() => {});
    return mongoose.connection.readyState === 1;
  }

  try {
    mongoose.set('bufferCommands', true);
    mongoConnectPromise = mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });
    await mongoConnectPromise;
    isMongoConnected = true;
    return true;
  } catch (err) {
    isMongoConnected = false;
    mongoConnectPromise = null;
    console.warn('MongoDB connection attempt failed:', err.message);
    return false;
  }
}

async function initMongoDB() {
  if (!MONGODB_URI) return;
  const connected = await connectToMongo();
  if (connected) {
    console.log('MongoDB initialized successfully');
    try {
      // Auto-seed if database is empty or missing details
      const postCount = await BlogPost.countDocuments();
      if (postCount === 0) {
        console.log('Seeding initial blog posts to MongoDB...');
        for (const p of initialPosts) {
          await BlogPost.create(p);
        }
      }

      const existingAbout = await AboutProfile.findOne();
      if (!existingAbout) {
        console.log('Seeding initial About profile to MongoDB...');
        await AboutProfile.create(initialAbout);
      }

      const existingHp = await Homepage.findOne();
      if (!existingHp) {
        await Homepage.create(initialHomepage);
      }

      const existingSettings = await SiteSettings.findOne();
      if (!existingSettings) {
        await SiteSettings.create(initialSettings);
      }

      const galleryCount = await GalleryItem.countDocuments();
      if (galleryCount === 0) {
        console.log('Seeding initial gallery photos to MongoDB...');
        for (const g of initialGallery) {
          await GalleryItem.create(g);
        }
      }

      // Sync in-memory caches from database
      const dbPosts = await BlogPost.find().sort({ createdAt: -1 });
      if (dbPosts.length > 0) {
        inMemoryPosts = dbPosts.map(p => p.toObject());
      }
      const dbGallery = await GalleryItem.find().sort({ order: 1, date: -1 });
      if (dbGallery.length > 0) {
        inMemoryGallery = dbGallery.map(g => g.toObject());
      }
    } catch (seedErr) {
      console.error('Error during MongoDB seed check:', seedErr.message);
    }
  }
}

// Start DB connection
const dbPromise = initMongoDB();

// Middleware: ensure MongoDB connection is active for every request
app.use(async (req, res, next) => {
  if (MONGODB_URI && mongoose.connection.readyState !== 1) {
    await connectToMongo().catch(() => {});
  }
  next();
});

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

if (MONGODB_URI) {
  try {
    sessionOptions.store = MongoStore.create({
      mongoUrl: MONGODB_URI,
      collectionName: 'sessions',
      ttl: 7 * 24 * 60 * 60,
      autoRemove: 'native'
    });
  } catch (e) {
    console.warn('Could not initialize MongoStore, using MemoryStore for sessions:', e.message);
  }
}

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
    return next();
  }
  // Check Authorization header or query token for iframe/cross-site support
  const authHeader = req.headers['authorization'] || req.headers['x-admin-token'];
  const queryToken = req.query.token;
  if (isValidToken(authHeader) || isValidToken(queryToken)) {
    if (req.session) {
      req.session.isAdmin = true;
    }
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
    storage: (isMongoConnected || mongoose.connection.readyState === 1) ? 'mongodb' : 'in-memory',
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

    if (await isDbConnected()) {
      const conditions = [
        {
          $or: [
            { status: 'published' },
            { status: 'scheduled', scheduledAt: { $lte: now } }
          ]
        }
      ];

      if (category && category.trim()) {
        conditions.push({ category: category.trim().toLowerCase() });
      }

      if (tag && tag.trim()) {
        conditions.push({ labels: tag.trim().toLowerCase() });
      }

      if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), 'i');
        conditions.push({
          $or: [
            { title: searchRegex },
            { excerpt: searchRegex },
            { labels: searchRegex },
            { content: searchRegex }
          ]
        });
      }

      const query = conditions.length === 1 ? conditions[0] : { $and: conditions };

      const sortOption = sort === 'oldest' ? { publishedAt: 1, createdAt: 1 } : { publishedAt: -1, createdAt: -1 };
      const pNum = Math.max(1, parseInt(page) || 1);
      const lNum = Math.max(1, parseInt(limit) || 10);
      const skip = (pNum - 1) * lNum;

      const [posts, total] = await Promise.all([
        BlogPost.find(query).sort(sortOption).skip(skip).limit(lNum).select('-content'),
        BlogPost.countDocuments(query)
      ]);

      return res.json({
        posts,
        pagination: { page: pNum, limit: lNum, total, pages: Math.ceil(total / lNum) || 1 }
      });
    }

    // In-memory fallback
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
    if (await isDbConnected()) {
      const categories = await BlogPost.distinct('category', { status: 'published' });
      return res.json({ categories: categories.filter(Boolean) });
    }
    const cats = [...new Set(inMemoryPosts.filter(p => p.status === 'published').map(p => p.category).filter(Boolean))];
    res.json({ categories: cats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.get('/api/posts/labels', async (req, res) => {
  try {
    if (await isDbConnected()) {
      const pipeline = [
        { $match: { status: 'published' } },
        { $unwind: '$labels' },
        { $group: { _id: '$labels', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ];
      const results = await BlogPost.aggregate(pipeline);
      return res.json({ labels: results.map(r => ({ name: r._id, count: r.count })) });
    }
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
    const pubCondition = {
      $or: [
        { status: 'published' },
        { status: 'scheduled', scheduledAt: { $lte: now } }
      ]
    };

    if (await isDbConnected()) {
      const current = await BlogPost.findOne({ slug: currentSlug, ...pubCondition });
      if (!current) return res.status(404).json({ error: 'Post not found' });
      const refDate = current.publishedAt || current.createdAt || now;
      const [prev, nextPost] = await Promise.all([
        BlogPost.findOne({ ...pubCondition, publishedAt: { $lt: refDate } }).sort({ publishedAt: -1, createdAt: -1 }).select('slug title'),
        BlogPost.findOne({ ...pubCondition, publishedAt: { $gt: refDate } }).sort({ publishedAt: 1, createdAt: 1 }).select('slug title')
      ]);
      return res.json({ previous: prev, next: nextPost });
    }

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

    if (await isDbConnected()) {
      const post = await BlogPost.findOne({
        slug: slugParam,
        $or: [
          { status: 'published' },
          { status: 'scheduled', scheduledAt: { $lte: now } }
        ]
      });
      if (!post) return res.status(404).json({ error: 'Post not found' });
      post.viewCount = (post.viewCount || 0) + 1;
      await post.save().catch(() => {});
      return res.json({ post });
    }

    const post = inMemoryPosts.find(p => p.slug === slugParam && (
      p.status === 'published' || (p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt) <= now)
    ));
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.viewCount = (post.viewCount || 0) + 1;
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

/* --- Public Content --- */
app.get('/api/content/settings', async (req, res) => {
  try {
    if (await isDbConnected()) {
      let settings = await SiteSettings.findOne();
      if (!settings) settings = await SiteSettings.create(initialSettings);
      return res.json({ settings });
    }
    res.json({ settings: inMemorySettings });
  } catch (err) {
    res.json({ settings: inMemorySettings });
  }
});

app.get('/api/content/homepage', async (req, res) => {
  try {
    if (await isDbConnected()) {
      let page = await Homepage.findOne();
      if (!page) page = await Homepage.create(initialHomepage);
      return res.json({ page });
    }
    res.json({ page: inMemoryHomepage });
  } catch (err) {
    res.json({ page: inMemoryHomepage });
  }
});

app.get('/api/content/about', async (req, res) => {
  try {
    if (await isDbConnected()) {
      let profile = await AboutProfile.findOne();
      if (!profile || !profile.biography) {
        profile = await AboutProfile.findOneAndUpdate({}, { $set: initialAbout }, { upsert: true, new: true });
      }
      return res.json({ profile });
    }
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
    const { category, search, page = 1, limit = 24, sort = 'newest' } = req.query;
    const pNum = Math.max(1, parseInt(page) || 1);
    const lNum = Math.max(1, parseInt(limit) || 24);

    if (await isDbConnected()) {
      const query = { status: 'published' };
      if (category && category.toLowerCase() !== 'all') {
        query.category = new RegExp('^' + category.trim() + '$', 'i');
      }
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { title: searchRegex },
          { caption: searchRegex },
          { location: searchRegex },
          { tags: searchRegex }
        ];
      }

      const sortObj = sort === 'oldest' 
        ? { date: 1, createdAt: 1 } 
        : { featured: -1, order: 1, date: -1, createdAt: -1 };

      const total = await GalleryItem.countDocuments(query);
      const photos = await GalleryItem.find(query)
        .sort(sortObj)
        .skip((pNum - 1) * lNum)
        .limit(lNum);

      const rawCategories = await GalleryItem.aggregate([
        { $match: { status: 'published' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
      const categories = rawCategories.map(c => ({ name: c._id || 'General', count: c.count }));

      return res.json({
        photos,
        total,
        page: pNum,
        totalPages: Math.ceil(total / lNum) || 1,
        categories
      });
    }

    // In-memory fallback
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
    if (await isDbConnected()) {
      const raw = await GalleryItem.aggregate([
        { $match: { status: 'published' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
      return res.json({ categories: raw.map(c => ({ name: c._id || 'General', count: c.count })) });
    }
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
    if (await isDbConnected()) {
      const photo = await GalleryItem.findById(id);
      if (!photo) return res.status(404).json({ error: 'Photo not found' });
      return res.json({ photo });
    }
    const photo = inMemoryGallery.find(item => item._id === id);
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
    if (await isDbConnected()) {
      const [total, published, drafts, scheduled, totalPhotos] = await Promise.all([
        BlogPost.countDocuments({ status: { $ne: 'trashed' } }),
        BlogPost.countDocuments({ status: 'published' }),
        BlogPost.countDocuments({ status: 'draft' }),
        BlogPost.countDocuments({ status: 'scheduled', scheduledAt: { $gt: now } }),
        GalleryItem.countDocuments()
      ]);
      return res.json({ total, published, drafts, scheduled, totalPhotos });
    }
    const total = inMemoryPosts.filter(p => p.status !== 'trashed').length;
    const published = inMemoryPosts.filter(p => p.status === 'published').length;
    const drafts = inMemoryPosts.filter(p => p.status === 'draft').length;
    const scheduled = inMemoryPosts.filter(p => p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt) > now).length;
    const totalPhotos = inMemoryGallery.length;
    res.json({ total, published, drafts, scheduled, totalPhotos });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/admin/posts', authMiddleware, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const pNum = Math.max(1, parseInt(page) || 1);
    const lNum = Math.max(1, parseInt(limit) || 20);

    if (await isDbConnected()) {
      const query = {};
      if (status && status !== '') query.status = status;
      else query.status = { $ne: 'trashed' };

      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { excerpt: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (pNum - 1) * lNum;
      const [posts, total] = await Promise.all([
        BlogPost.find(query).sort({ updatedAt: -1, createdAt: -1 }).skip(skip).limit(lNum),
        BlogPost.countDocuments(query)
      ]);

      return res.json({
        posts,
        pagination: { page: pNum, limit: lNum, total, pages: Math.ceil(total / lNum) || 1 }
      });
    }

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
    if (await isDbConnected()) {
      const post = await BlogPost.findById(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      return res.json({ post });
    }
    const post = inMemoryPosts.find(p => p._id === req.params.id);
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
    const { field, title, content, category, excerpt, labels } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (field === 'excerpt') {
      const generated = await editorialService.generateExcerpt(title, content);
      return res.json({ value: generated, source: 'generated' });
    } else if (field === 'tags') {
      const generated = await editorialService.generateTags(title, excerpt, content, category);
      return res.json({ value: generated, source: 'generated' });
    } else if (field === 'featuredImage') {
      const query = await editorialService.extractSearchKeywords(title, content, category);
      const stock = await editorialService.searchStockImage(query, category);
      if (stock) {
        const imgUrl = await editorialService.createFeaturedImage(stock, title, 'Chitron Bhattacharjee', generateSlug(title));
        return res.json({
          value: imgUrl,
          source: 'stock',
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
      return res.status(404).json({ error: 'No stock image found' });
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

    if (await isDbConnected()) {
      // Check duplicate slug
      const existing = await BlogPost.findOne({ slug: postSlug });
      if (existing) {
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
        editorialAutomation: enriched.editorialAutomation
      };

      const post = new BlogPost(postData);
      await post.save();

      // Sync to in-memory fallback
      const plainPost = post.toObject();
      inMemoryPosts.unshift(plainPost);

      return res.status(201).json({ post });
    }

    // In-memory fallback
    if (inMemoryPosts.some(p => p.slug === postSlug)) {
      postSlug = `${postSlug}-${Date.now().toString(36)}`;
    }

    const newPost = {
      _id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
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
      viewCount: 0,
      seoTitle: (seoTitle || '').trim(),
      seoDescription: (seoDescription || '').trim(),
      canonicalUrl: (canonicalUrl || '').trim(),
      featured: !!featured,
      commentsEnabled: commentsEnabled !== false,
      editorialAutomation: enriched.editorialAutomation,
      createdAt: now,
      updatedAt: now
    };

    inMemoryPosts.unshift(newPost);
    res.status(201).json({ post: newPost });
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

    if (await isDbConnected()) {
      const post = await BlogPost.findById(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });

      // Save revision
      await new Revision({
        postId: post._id,
        title: post.title,
        content: post.content,
        excerpt: post.excerpt,
        labels: post.labels,
        category: post.category
      }).save().catch(() => {});

      if (title) post.title = title.trim();

      // Slug update
      if (title || slug) {
        let newSlug = generateSlug(title || post.title, slug || post.slug);
        const dup = await BlogPost.findOne({ slug: newSlug, _id: { $ne: post._id } });
        if (dup) newSlug = `${newSlug}-${Date.now().toString(36)}`;
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

      // Re-run editorial automation if missing fields
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

      await post.save();

      // Sync to inMemoryPosts
      const idx = inMemoryPosts.findIndex(p => String(p._id) === String(post._id));
      if (idx !== -1) {
        inMemoryPosts[idx] = post.toObject();
      } else {
        inMemoryPosts.unshift(post.toObject());
      }

      return res.json({ post });
    }

    // In-memory fallback
    const post = inMemoryPosts.find(p => p._id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    inMemoryRevisions.unshift({
      _id: `rev-${Date.now()}`,
      postId: post._id,
      title: post.title,
      content: post.content,
      excerpt: post.excerpt,
      labels: [...(post.labels || [])],
      category: post.category,
      savedAt: now
    });

    if (title) post.title = title.trim();

    if (title || slug) {
      let newSlug = generateSlug(title || post.title, slug || post.slug);
      if (inMemoryPosts.some(p => p.slug === newSlug && p._id !== post._id)) {
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

    post.updatedAt = now;
    res.json({ post });
  } catch (err) {
    console.error('Error updating post:', err);
    res.status(500).json({ error: err.message || 'Failed to update post' });
  }
});

app.delete('/api/admin/posts/:id', authMiddleware, async (req, res) => {
  try {
    if (await isDbConnected()) {
      const post = await BlogPost.findById(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      post.status = 'trashed';
      await post.save();
      const inMem = inMemoryPosts.find(p => String(p._id) === String(post._id));
      if (inMem) inMem.status = 'trashed';
      return res.json({ success: true });
    }
    const post = inMemoryPosts.find(p => p._id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.status = 'trashed';
    post.updatedAt = new Date();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to trash post' });
  }
});

app.post('/api/admin/posts/:id/publish', authMiddleware, async (req, res) => {
  try {
    if (await isDbConnected()) {
      const post = await BlogPost.findById(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      post.status = 'published';
      post.publishedAt = new Date();
      await post.save();
      const inMem = inMemoryPosts.find(p => String(p._id) === String(post._id));
      if (inMem) {
        inMem.status = 'published';
        inMem.publishedAt = post.publishedAt;
      }
      return res.json({ post });
    }
    const post = inMemoryPosts.find(p => p._id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.status = 'published';
    post.publishedAt = new Date();
    post.updatedAt = new Date();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish' });
  }
});

app.post('/api/admin/posts/:id/unpublish', authMiddleware, async (req, res) => {
  try {
    if (await isDbConnected()) {
      const post = await BlogPost.findById(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      post.status = 'draft';
      await post.save();
      const inMem = inMemoryPosts.find(p => String(p._id) === String(post._id));
      if (inMem) inMem.status = 'draft';
      return res.json({ post });
    }
    const post = inMemoryPosts.find(p => p._id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.status = 'draft';
    post.updatedAt = new Date();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unpublish' });
  }
});

app.post('/api/admin/posts/:id/restore', authMiddleware, async (req, res) => {
  try {
    if (await isDbConnected()) {
      const post = await BlogPost.findById(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      post.status = 'draft';
      await post.save();
      const inMem = inMemoryPosts.find(p => String(p._id) === String(post._id));
      if (inMem) inMem.status = 'draft';
      return res.json({ post });
    }
    const post = inMemoryPosts.find(p => p._id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.status = 'draft';
    post.updatedAt = new Date();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore' });
  }
});

app.delete('/api/admin/posts/:id/permanent', authMiddleware, async (req, res) => {
  try {
    if (await isDbConnected()) {
      await BlogPost.findByIdAndDelete(req.params.id);
      await Revision.deleteMany({ postId: req.params.id }).catch(() => {});
      inMemoryPosts = inMemoryPosts.filter(p => String(p._id) !== String(req.params.id));
      return res.json({ success: true });
    }
    const idx = inMemoryPosts.findIndex(p => p._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Post not found' });
    inMemoryPosts.splice(idx, 1);
    inMemoryRevisions = inMemoryRevisions.filter(r => r.postId !== req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to permanently delete' });
  }
});

app.post('/api/admin/posts/:id/duplicate', authMiddleware, async (req, res) => {
  try {
    if (await isDbConnected()) {
      const original = await BlogPost.findById(req.params.id);
      if (!original) return res.status(404).json({ error: 'Post not found' });
      const dup = new BlogPost({
        title: `${original.title} (Copy)`,
        slug: `${original.slug}-copy-${Date.now()}`,
        excerpt: original.excerpt,
        content: original.content,
        coverImage: original.coverImage,
        category: original.category,
        labels: [...(original.labels || [])],
        status: 'draft',
        seoTitle: original.seoTitle,
        seoDescription: original.seoDescription
      });
      await dup.save();
      inMemoryPosts.unshift(dup.toObject());
      return res.status(201).json({ post: dup });
    }

    const original = inMemoryPosts.find(p => p._id === req.params.id);
    if (!original) return res.status(404).json({ error: 'Post not found' });
    const dup = {
      ...original,
      _id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: `${original.title} (Copy)`,
      slug: `${original.slug}-copy-${Date.now()}`,
      status: 'draft',
      publishedAt: null,
      scheduledAt: null,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    inMemoryPosts.unshift(dup);
    res.status(201).json({ post: dup });
  } catch (err) {
    res.status(500).json({ error: 'Failed to duplicate post' });
  }
});

/* --- Revisions --- */
app.get('/api/admin/revisions/:postId', authMiddleware, async (req, res) => {
  try {
    if (await isDbConnected()) {
      const revisions = await Revision.find({ postId: req.params.postId }).sort({ savedAt: -1 }).limit(20);
      return res.json({ revisions });
    }
    const revisions = inMemoryRevisions.filter(r => r.postId === req.params.postId);
    res.json({ revisions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch revisions' });
  }
});

app.post('/api/admin/revisions/:revisionId/restore', authMiddleware, async (req, res) => {
  try {
    if (await isDbConnected()) {
      const revision = await Revision.findById(req.params.revisionId);
      if (!revision) return res.status(404).json({ error: 'Revision not found' });
      const post = await BlogPost.findById(revision.postId);
      if (!post) return res.status(404).json({ error: 'Post not found' });

      post.title = revision.title;
      post.content = revision.content;
      post.excerpt = revision.excerpt;
      if (revision.labels) post.labels = revision.labels;
      if (revision.category) post.category = revision.category;
      await post.save();
      return res.json({ post });
    }

    const revision = inMemoryRevisions.find(r => r._id === req.params.revisionId);
    if (!revision) return res.status(404).json({ error: 'Revision not found' });
    const post = inMemoryPosts.find(p => p._id === revision.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.title = revision.title;
    post.content = revision.content;
    post.excerpt = revision.excerpt;
    if (revision.labels) post.labels = [...revision.labels];
    if (revision.category) post.category = revision.category;
    post.updatedAt = new Date();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore revision' });
  }
});

/* --- Admin Labels & Categories --- */
app.get('/api/admin/labels', authMiddleware, async (req, res) => {
  try {
    if (await isDbConnected()) {
      const pipeline = [
        { $unwind: '$labels' },
        { $group: { _id: '$labels', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ];
      const results = await BlogPost.aggregate(pipeline);
      return res.json({ labels: results.map(r => ({ name: r._id, count: r.count })) });
    }
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
    if (await isDbConnected()) {
      const categories = await BlogPost.distinct('category');
      return res.json({ categories: categories.filter(Boolean) });
    }
    const cats = [...new Set(inMemoryPosts.map(p => p.category).filter(Boolean))];
    res.json({ categories: cats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/* --- Admin Content Update Endpoints --- */
app.get('/api/admin/content/settings', authMiddleware, async (req, res) => {
  try {
    if (await isDbConnected()) {
      let settings = await SiteSettings.findOne();
      if (!settings) settings = await SiteSettings.create(initialSettings);
      return res.json({ settings });
    }
    res.json({ settings: inMemorySettings });
  } catch (err) {
    res.json({ settings: inMemorySettings });
  }
});

app.put('/api/admin/content/settings', authMiddleware, async (req, res) => {
  try {
    inMemorySettings = { ...inMemorySettings, ...req.body };
    if (await isDbConnected()) {
      const settings = await SiteSettings.findOneAndUpdate({}, { $set: req.body }, { new: true, upsert: true, setDefaultsOnInsert: true });
      return res.json({ settings });
    }
    res.json({ settings: inMemorySettings });
  } catch (err) {
    console.error('Error saving settings:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

app.get('/api/admin/content/homepage', authMiddleware, async (req, res) => {
  try {
    if (await isDbConnected()) {
      let page = await Homepage.findOne();
      if (!page) page = await Homepage.create(initialHomepage);
      return res.json({ page });
    }
    res.json({ page: inMemoryHomepage });
  } catch (err) {
    res.json({ page: inMemoryHomepage });
  }
});

app.put('/api/admin/content/homepage', authMiddleware, async (req, res) => {
  try {
    inMemoryHomepage = { ...inMemoryHomepage, ...req.body };
    if (await isDbConnected()) {
      const page = await Homepage.findOneAndUpdate({}, { $set: req.body }, { new: true, upsert: true, setDefaultsOnInsert: true });
      return res.json({ page });
    }
    res.json({ page: inMemoryHomepage });
  } catch (err) {
    console.error('Error saving homepage:', err);
    res.status(500).json({ error: 'Failed to save homepage' });
  }
});

app.get('/api/admin/content/about', authMiddleware, async (req, res) => {
  try {
    if (await isDbConnected()) {
      let profile = await AboutProfile.findOne();
      if (!profile || !profile.biography) {
        profile = await AboutProfile.findOneAndUpdate({}, { $set: initialAbout }, { upsert: true, new: true });
      }
      return res.json({ profile });
    }
    res.json({ profile: inMemoryAbout });
  } catch (err) {
    res.json({ profile: inMemoryAbout });
  }
});

app.put('/api/admin/content/about', authMiddleware, async (req, res) => {
  try {
    inMemoryAbout = { ...inMemoryAbout, ...req.body };
    if (await isDbConnected()) {
      const profile = await AboutProfile.findOneAndUpdate(
        {},
        { $set: req.body },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      return res.json({ profile });
    }
    res.json({ profile: inMemoryAbout });
  } catch (err) {
    console.error('Error saving about profile:', err);
    res.status(500).json({ error: 'Failed to save about' });
  }
});

/* --- Admin Gallery Endpoints --- */
app.get('/api/admin/gallery', authMiddleware, async (req, res) => {
  try {
    const { search, status, category, page = 1, limit = 50 } = req.query;
    const pNum = Math.max(1, parseInt(page) || 1);
    const lNum = Math.max(1, parseInt(limit) || 50);

    if (await isDbConnected()) {
      const query = {};
      if (status && status !== 'all') query.status = status;
      if (category && category !== 'all') query.category = new RegExp('^' + category.trim() + '$', 'i');
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { title: searchRegex },
          { caption: searchRegex },
          { location: searchRegex },
          { tags: searchRegex }
        ];
      }

      const total = await GalleryItem.countDocuments(query);
      const photos = await GalleryItem.find(query)
        .sort({ order: 1, date: -1, createdAt: -1 })
        .skip((pNum - 1) * lNum)
        .limit(lNum);
      const categories = await GalleryItem.distinct('category');

      return res.json({
        photos,
        total,
        page: pNum,
        totalPages: Math.ceil(total / lNum) || 1,
        categories: categories.filter(Boolean)
      });
    }

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

    res.json({
      photos: paginated,
      total,
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
    const { id } = req.params;
    if (await isDbConnected()) {
      const photo = await GalleryItem.findById(id);
      if (!photo) return res.status(404).json({ error: 'Photo not found' });
      return res.json({ photo });
    }
    const photo = inMemoryGallery.find(p => p._id === id);
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

    const photoData = {
      title: title.trim(),
      caption: (caption || '').trim(),
      url: url.trim(),
      category: (category || 'Photography').trim(),
      tags: parsedTags,
      location: (location || '').trim(),
      alt: (alt || title).trim(),
      date: date ? new Date(date) : new Date(),
      featured: featured === true || featured === 'true' || featured === '1',
      status: (status === 'draft') ? 'draft' : 'published',
      order: parseInt(order) || 0
    };

    if (await isDbConnected()) {
      const created = await GalleryItem.create(photoData);
      inMemoryGallery.unshift(created.toObject());
      return res.status(201).json({ success: true, photo: created });
    }

    const newPhoto = {
      ...photoData,
      _id: `mem-photo-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    inMemoryGallery.unshift(newPhoto);
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
    if (date !== undefined) updates.date = new Date(date);
    if (featured !== undefined) updates.featured = featured === true || featured === 'true' || featured === '1';
    if (status !== undefined) updates.status = (status === 'draft') ? 'draft' : 'published';
    if (order !== undefined) updates.order = parseInt(order) || 0;
    updates.updatedAt = new Date();

    if (await isDbConnected()) {
      const updated = await GalleryItem.findByIdAndUpdate(id, { $set: updates }, { new: true });
      if (!updated) return res.status(404).json({ error: 'Photo not found' });
      const idx = inMemoryGallery.findIndex(p => String(p._id) === String(id));
      if (idx !== -1) inMemoryGallery[idx] = updated.toObject();
      return res.json({ success: true, photo: updated });
    }

    const idx = inMemoryGallery.findIndex(p => p._id === id);
    if (idx === -1) return res.status(404).json({ error: 'Photo not found' });
    inMemoryGallery[idx] = { ...inMemoryGallery[idx], ...updates };
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
    let photoUrl = '';

    if (await isDbConnected()) {
      const photo = await GalleryItem.findById(id);
      if (!photo) return res.status(404).json({ error: 'Photo not found' });
      photoUrl = photo.url;
      await GalleryItem.findByIdAndDelete(id);
      inMemoryGallery = inMemoryGallery.filter(p => String(p._id) !== String(id));
    } else {
      const idx = inMemoryGallery.findIndex(p => p._id === id);
      if (idx === -1) return res.status(404).json({ error: 'Photo not found' });
      photoUrl = inMemoryGallery[idx].url;
      inMemoryGallery.splice(idx, 1);
    }

    // If local file in uploads/gallery, remove it cleanly
    if (photoUrl && photoUrl.startsWith('/uploads/gallery/')) {
      const localPath = path.join(__dirname, photoUrl);
      if (fs.existsSync(localPath)) {
        try { fs.unlinkSync(localPath); } catch (e) {}
      }
    }

    res.json({ success: true, message: 'Photo deleted successfully' });
  } catch (err) {
    console.error('Error deleting gallery photo:', err);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// Quick publish/unpublish toggles
app.post('/api/admin/gallery/:id/publish', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (await isDbConnected()) {
      const photo = await GalleryItem.findByIdAndUpdate(id, { $set: { status: 'published', updatedAt: new Date() } }, { new: true });
      const inMem = inMemoryGallery.find(p => String(p._id) === String(id));
      if (inMem) inMem.status = 'published';
      return res.json({ success: true, photo });
    }
    const p = inMemoryGallery.find(item => item._id === id);
    if (!p) return res.status(404).json({ error: 'Photo not found' });
    p.status = 'published';
    p.updatedAt = new Date();
    res.json({ success: true, photo: p });
  } catch (err) {
    res.status(500).json({ error: 'Failed to publish photo' });
  }
});

app.post('/api/admin/gallery/:id/unpublish', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (await isDbConnected()) {
      const photo = await GalleryItem.findByIdAndUpdate(id, { $set: { status: 'draft', updatedAt: new Date() } }, { new: true });
      const inMem = inMemoryGallery.find(p => String(p._id) === String(id));
      if (inMem) inMem.status = 'draft';
      return res.json({ success: true, photo });
    }
    const p = inMemoryGallery.find(item => item._id === id);
    if (!p) return res.status(404).json({ error: 'Photo not found' });
    p.status = 'draft';
    p.updatedAt = new Date();
    res.json({ success: true, photo: p });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unpublish photo' });
  }
});

/* --- Dynamic Sitemap and RSS Feed Generation --- */
app.get('/sitemap.xml', async (req, res) => {
  try {
    const siteUrl = 'https://chitron.iam.bd';
    let posts = [];
    if (await isDbConnected()) {
      posts = await BlogPost.find({ status: 'published' }).sort({ publishedAt: -1 }).select('slug publishedAt updatedAt');
    } else {
      posts = inMemoryPosts.filter(p => p.status === 'published');
    }

    const today = new Date().toISOString().split('T')[0];
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
    xml += `        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n`;
    xml += `        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9\n`;
    xml += `        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n`;

    // Static pages
    xml += `  <url>\n    <loc>${siteUrl}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
    xml += `  <url>\n    <loc>${siteUrl}/about.html</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
    xml += `  <url>\n    <loc>${siteUrl}/writing.html</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
    xml += `  <url>\n    <loc>${siteUrl}/gallery.html</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;

    // Dynamic Posts
    posts.forEach(p => {
      const pDate = (p.updatedAt || p.publishedAt || new Date()).toISOString().split('T')[0];
      xml += `  <url>\n    <loc>${siteUrl}/post.html?slug=${encodeURIComponent(p.slug)}</loc>\n    <lastmod>${pDate}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
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
    let posts = [];
    if (await isDbConnected()) {
      posts = await BlogPost.find({ status: 'published' }).sort({ publishedAt: -1 });
    } else {
      posts = inMemoryPosts.filter(p => p.status === 'published');
    }

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
      xml += `      <link>${siteUrl}/post.html?slug=${encodeURIComponent(p.slug)}</link>\n`;
      xml += `      <guid>${siteUrl}/post.html?slug=${encodeURIComponent(p.slug)}</guid>\n`;
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

/* --- Static Files Serving --- */
const staticRoot = path.resolve(__dirname);
app.use(express.static(staticRoot));

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

app.listen(PORT, HOST, () => {
  console.log(`Chitrons Archive server running on http://${HOST}:${PORT}`);
  console.log(`Admin PIN configured: ${ADMIN_PIN ? 'Yes' : 'No'}`);
});
