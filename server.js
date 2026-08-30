const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const mongoose = require('mongoose');
const slugify = require('slugify');
const crypto = require('crypto');

require('dotenv').config();

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
  headline: "Hi, I'm Chitron Bhattacharjee.",
  shortBio: "I'm an AI developer, programmer, and writer from Bangladesh. I build software, experiment with conversational AI, and write about technology, society, and ideas.",
  biography: "I am a developer and student based in Bangladesh with a deep curiosity for how humans and digital systems interact.\n\nMy work ranges from building conversational AI systems like ShiPu AI to crafting responsive web applications, bot architectures, and writing essays on technology and human experience.\n\nI believe in learning by building practical tools that solve real problems rather than treating programming merely as an abstract concept.",
  profileImage: '',
  imageAlt: 'Chitron Bhattacharjee',
  roles: ['AI Developer', 'Full-Stack Programmer', 'Bot Developer', 'Writer & Creative Technologist'],
  interests: [
    'Artificial Intelligence & LLMs',
    'Conversational Agents',
    'Full-Stack Web Development',
    'Cybersecurity & Automation',
    'Bengali Natural Language Processing',
    'Reflective Writing & Poetry'
  ],
  skills: [
    'JavaScript / Node.js',
    'Express & REST APIs',
    'Python & Prompt Engineering',
    'HTML5 / CSS3 / UI Design',
    'MongoDB & Databases',
    'Bot Architectures & Automation',
    'Git & Cloud Deployment'
  ],
  projects: [
    {
      title: 'ShiPu AI',
      description: 'A conversational Bengali AI chatbot system integrating LLM architectures and natural conversational personalities.',
      tech: 'Node.js, LLMs, REST APIs',
      url: 'https://github.com/AdiBhaiAlpha'
    },
    {
      title: 'Chitrons Archive',
      description: 'A minimalist personal digital archive, publishing platform, and CMS for writings, notes, and technical ideas.',
      tech: 'Node.js, Express, JavaScript, CSS3',
      url: 'https://github.com/AdiBhaiAlpha/chitrons-archive'
    },
    {
      title: 'Bot Development Ecosystem',
      description: 'Custom messaging bot architectures, command processors, and webhook automation frameworks.',
      tech: 'JavaScript, Node.js, Webhooks',
      url: 'https://github.com/AdiBhaiAlpha'
    }
  ],
  philosophy: 'I prefer clean, understated interfaces and practical technology built for real people. Software should be transparent, respectful of attention, and continuously improved through iteration.',
  currentFocus: 'Currently exploring advanced prompt engineering, autonomous bot workflows, and expanding this writing archive.',
  writingSection: 'Alongside technical work, I write essays, poetry, and reflective pieces examining the relationship between society, human emotions, and digital technology.',
  contactLinks: [
    { name: 'GitHub', url: 'https://github.com/AdiBhaiAlpha' },
    { name: 'Public Email', url: 'mailto:chitronbhattacharjee@gmail.com' },
    { name: 'Bio Link', url: 'https://chitron.bio.link' }
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
  siteName: 'Chitrons Archive',
  tagline: 'Notes, ideas, experiments and things worth remembering.',
  authorName: 'Chitron Bhattacharjee',
  authorTitle: 'AI Developer, Programmer & Writer',
  location: 'Bangladesh',
  profileImage: '',
  contactEmail: 'chitronbhattacharjee@gmail.com',
  seoTitle: 'Chitron Bhattacharjee — AI Developer, Programmer & Writer | Chitrons Archive',
  seoDescription: 'Personal digital archive of Chitron Bhattacharjee — AI developer, programmer, designer and writer from Bangladesh.',
  socialLinks: [
    { name: 'GitHub', url: 'https://github.com/AdiBhaiAlpha' },
    { name: 'Bio Link', url: 'https://chitron.bio.link' }
  ]
};

/* --- In-Memory State Fallback --- */
let inMemoryPosts = initialPosts.map((p, i) => ({ ...p, _id: `mem-post-${i + 1}`, createdAt: new Date(), updatedAt: new Date() }));
let inMemoryRevisions = [];
let inMemoryAbout = { ...initialAbout };
let inMemoryHomepage = { ...initialHomepage };
let inMemorySettings = { ...initialSettings };

let isMongoConnected = false;
let sessionStore = null;

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
  console.warn('MongoDB connection event error:', err.message);
});

async function initMongoDB() {
  if (!MONGODB_URI) return;
  try {
    mongoose.set('bufferCommands', false);
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000
    });
    isMongoConnected = true;
    console.log('MongoDB initialized successfully');

    // Auto-seed if database is empty or missing details
    const postCount = await BlogPost.countDocuments();
    if (postCount === 0) {
      console.log('Seeding initial blog posts to MongoDB...');
      for (const p of initialPosts) {
        await BlogPost.create(p);
      }
    }

    const existingAbout = await AboutProfile.findOne();
    if (!existingAbout || !existingAbout.biography) {
      console.log('Seeding complete About profile to MongoDB...');
      await AboutProfile.findOneAndUpdate({}, { $set: initialAbout }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }

    const existingHp = await Homepage.findOne();
    if (!existingHp) {
      await Homepage.create(initialHomepage);
    }

    const existingSettings = await SiteSettings.findOne();
    if (!existingSettings) {
      await SiteSettings.create(initialSettings);
    }
  } catch (err) {
    console.warn('MongoDB connection error, falling back to in-memory store:', err.message);
    isMongoConnected = false;
  }
}

// Start DB connection
const dbPromise = initMongoDB();

// Middleware: wait for DB initialization if pending
app.use(async (req, res, next) => {
  if (dbPromise && mongoose.connection.readyState === 0 && MONGODB_URI) {
    try {
      await dbPromise;
    } catch (e) {}
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

    if (isMongoConnected) {
      const query = {
        $or: [
          { status: 'published', publishedAt: { $lte: now } },
          { status: 'scheduled', scheduledAt: { $lte: now } }
        ]
      };
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { excerpt: { $regex: search, $options: 'i' } },
          { labels: { $regex: search, $options: 'i' } }
        ];
      }
      if (category) query.category = category.toLowerCase();
      if (tag) query.labels = tag.toLowerCase();

      const sortOption = sort === 'oldest' ? { publishedAt: 1 } : { publishedAt: -1 };
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
      if (p.status === 'published' && (!p.publishedAt || new Date(p.publishedAt) <= now)) return true;
      if (p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt) <= now) return true;
      return false;
    });

    if (category) list = list.filter(p => (p.category || '').toLowerCase() === category.toLowerCase());
    if (tag) list = list.filter(p => (p.labels || []).map(l => l.toLowerCase()).includes(tag.toLowerCase()));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.excerpt || '').toLowerCase().includes(q) ||
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
    console.error('Error fetching posts:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.get('/api/posts/categories', async (req, res) => {
  try {
    if (isMongoConnected) {
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
    if (isMongoConnected) {
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
    if (isMongoConnected) {
      const current = await BlogPost.findOne({ slug: currentSlug, status: 'published' });
      if (!current) return res.status(404).json({ error: 'Post not found' });
      const [prev, nextPost] = await Promise.all([
        BlogPost.findOne({ status: 'published', publishedAt: { $lt: current.publishedAt } }).sort({ publishedAt: -1 }).select('slug title'),
        BlogPost.findOne({ status: 'published', publishedAt: { $gt: current.publishedAt } }).sort({ publishedAt: 1 }).select('slug title')
      ]);
      return res.json({ previous: prev, next: nextPost });
    }

    const published = inMemoryPosts
      .filter(p => p.status === 'published')
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
    if (isMongoConnected) {
      const post = await BlogPost.findOne({ slug: req.params.slug, status: 'published' });
      if (!post) return res.status(404).json({ error: 'Post not found' });
      post.viewCount = (post.viewCount || 0) + 1;
      await post.save();
      return res.json({ post });
    }

    const post = inMemoryPosts.find(p => p.slug === req.params.slug && p.status === 'published');
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
    if (isMongoConnected) {
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
    if (isMongoConnected) {
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
    if (isMongoConnected) {
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

/* --- Admin Stats & Posts --- */
app.get('/api/admin/stats', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    if (isMongoConnected) {
      const [total, published, drafts, scheduled] = await Promise.all([
        BlogPost.countDocuments({ status: { $ne: 'trashed' } }),
        BlogPost.countDocuments({ status: 'published' }),
        BlogPost.countDocuments({ status: 'draft' }),
        BlogPost.countDocuments({ status: 'scheduled', scheduledAt: { $gt: now } })
      ]);
      return res.json({ total, published, drafts, scheduled });
    }
    const total = inMemoryPosts.filter(p => p.status !== 'trashed').length;
    const published = inMemoryPosts.filter(p => p.status === 'published').length;
    const drafts = inMemoryPosts.filter(p => p.status === 'draft').length;
    const scheduled = inMemoryPosts.filter(p => p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt) > now).length;
    res.json({ total, published, drafts, scheduled });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/admin/posts', authMiddleware, async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const pNum = Math.max(1, parseInt(page) || 1);
    const lNum = Math.max(1, parseInt(limit) || 20);

    if (isMongoConnected) {
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
    if (isMongoConnected) {
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

app.post('/api/admin/posts', authMiddleware, async (req, res) => {
  try {
    const {
      title, excerpt, content, coverImage, category, labels, slug, status,
      seoTitle, seoDescription, canonicalUrl, scheduledAt, featured, commentsEnabled
    } = req.body;

    if (!title || !excerpt) {
      return res.status(400).json({ error: 'Title and excerpt are required' });
    }

    let postSlug = slug || slugify(title, { lower: true, strict: true });
    const postStatus = status || 'draft';
    const now = new Date();

    if (isMongoConnected) {
      const existing = await BlogPost.findOne({ slug: postSlug });
      if (existing) postSlug = `${postSlug}-${Date.now()}`;

      const postData = {
        title,
        slug: postSlug,
        excerpt,
        content: content || '',
        coverImage: coverImage || '',
        author: 'Chitron Bhattacharjee',
        category: (category || 'general').toLowerCase(),
        labels: Array.isArray(labels) ? labels.map(l => l.toLowerCase().trim()).filter(Boolean) : [],
        status: postStatus,
        publishedAt: postStatus === 'published' ? now : null,
        scheduledAt: postStatus === 'scheduled' && scheduledAt ? new Date(scheduledAt) : null,
        readingTime: calcReadingTime(content),
        seoTitle: seoTitle || '',
        seoDescription: seoDescription || '',
        canonicalUrl: canonicalUrl || '',
        featured: !!featured,
        commentsEnabled: commentsEnabled !== false
      };

      const post = new BlogPost(postData);
      await post.save();
      return res.status(201).json({ post });
    }

    if (inMemoryPosts.some(p => p.slug === postSlug)) {
      postSlug = `${postSlug}-${Date.now()}`;
    }

    const newPost = {
      _id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title,
      slug: postSlug,
      excerpt,
      content: content || '',
      coverImage: coverImage || '',
      author: 'Chitron Bhattacharjee',
      category: (category || 'general').toLowerCase(),
      labels: Array.isArray(labels) ? labels.map(l => l.toLowerCase().trim()).filter(Boolean) : [],
      status: postStatus,
      publishedAt: postStatus === 'published' ? now : null,
      scheduledAt: postStatus === 'scheduled' && scheduledAt ? new Date(scheduledAt) : null,
      readingTime: calcReadingTime(content),
      viewCount: 0,
      seoTitle: seoTitle || '',
      seoDescription: seoDescription || '',
      canonicalUrl: canonicalUrl || '',
      featured: !!featured,
      commentsEnabled: commentsEnabled !== false,
      createdAt: now,
      updatedAt: now
    };

    inMemoryPosts.unshift(newPost);
    res.status(201).json({ post: newPost });
  } catch (err) {
    console.error('Error creating post:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

app.put('/api/admin/posts/:id', authMiddleware, async (req, res) => {
  try {
    const {
      title, excerpt, content, coverImage, category, labels, slug, status,
      seoTitle, seoDescription, canonicalUrl, scheduledAt, featured, commentsEnabled
    } = req.body;

    if (isMongoConnected) {
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

      if (title && title !== post.title) {
        let newSlug = slug || slugify(title, { lower: true, strict: true });
        const dup = await BlogPost.findOne({ slug: newSlug, _id: { $ne: post._id } });
        if (dup) newSlug = `${newSlug}-${Date.now()}`;
        post.slug = newSlug;
      }

      if (title) post.title = title;
      if (excerpt) post.excerpt = excerpt;
      if (content !== undefined) {
        post.content = content;
        post.readingTime = calcReadingTime(content);
      }
      if (coverImage !== undefined) post.coverImage = coverImage;
      if (category) post.category = category.toLowerCase();
      if (labels) post.labels = labels.map(l => l.toLowerCase().trim()).filter(Boolean);
      if (seoTitle !== undefined) post.seoTitle = seoTitle;
      if (seoDescription !== undefined) post.seoDescription = seoDescription;
      if (canonicalUrl !== undefined) post.canonicalUrl = canonicalUrl;
      if (featured !== undefined) post.featured = featured;
      if (commentsEnabled !== undefined) post.commentsEnabled = commentsEnabled;

      if (status && status !== post.status) {
        post.status = status;
        if (status === 'published' && !post.publishedAt) post.publishedAt = new Date();
        else if (status === 'scheduled' && scheduledAt) post.scheduledAt = new Date(scheduledAt);
      }

      if (scheduledAt && post.status === 'scheduled') {
        post.scheduledAt = new Date(scheduledAt);
      }

      await post.save();
      return res.json({ post });
    }

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
      savedAt: new Date()
    });

    if (title && title !== post.title) {
      let newSlug = slug || slugify(title, { lower: true, strict: true });
      if (inMemoryPosts.some(p => p.slug === newSlug && p._id !== post._id)) {
        newSlug = `${newSlug}-${Date.now()}`;
      }
      post.slug = newSlug;
    }

    if (title) post.title = title;
    if (excerpt) post.excerpt = excerpt;
    if (content !== undefined) {
      post.content = content;
      post.readingTime = calcReadingTime(content);
    }
    if (coverImage !== undefined) post.coverImage = coverImage;
    if (category) post.category = category.toLowerCase();
    if (labels) post.labels = labels.map(l => l.toLowerCase().trim()).filter(Boolean);
    if (seoTitle !== undefined) post.seoTitle = seoTitle;
    if (seoDescription !== undefined) post.seoDescription = seoDescription;
    if (canonicalUrl !== undefined) post.canonicalUrl = canonicalUrl;
    if (featured !== undefined) post.featured = featured;
    if (commentsEnabled !== undefined) post.commentsEnabled = commentsEnabled;

    if (status && status !== post.status) {
      post.status = status;
      if (status === 'published' && !post.publishedAt) post.publishedAt = new Date();
      else if (status === 'scheduled' && scheduledAt) post.scheduledAt = new Date(scheduledAt);
    }

    if (scheduledAt && post.status === 'scheduled') {
      post.scheduledAt = new Date(scheduledAt);
    }

    post.updatedAt = new Date();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update post' });
  }
});

app.delete('/api/admin/posts/:id', authMiddleware, async (req, res) => {
  try {
    if (isMongoConnected) {
      const post = await BlogPost.findById(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      post.status = 'trashed';
      await post.save();
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
    if (isMongoConnected) {
      const post = await BlogPost.findById(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      post.status = 'published';
      post.publishedAt = new Date();
      await post.save();
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
    if (isMongoConnected) {
      const post = await BlogPost.findById(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      post.status = 'draft';
      await post.save();
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
    if (isMongoConnected) {
      const post = await BlogPost.findById(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });
      post.status = 'draft';
      await post.save();
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
    if (isMongoConnected) {
      await BlogPost.findByIdAndDelete(req.params.id);
      await Revision.deleteMany({ postId: req.params.id }).catch(() => {});
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
    if (isMongoConnected) {
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
    if (isMongoConnected) {
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
    if (isMongoConnected) {
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
    if (isMongoConnected) {
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
    if (isMongoConnected) {
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
    if (isMongoConnected) {
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
    if (isMongoConnected) {
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
    if (isMongoConnected) {
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
    if (isMongoConnected) {
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
    if (isMongoConnected) {
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
    if (isMongoConnected) {
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

/* --- Dynamic Sitemap and RSS Feed Generation --- */
app.get('/sitemap.xml', async (req, res) => {
  try {
    const siteUrl = 'https://adibhaialpha.github.io/chitrons-archive';
    let posts = [];
    if (isMongoConnected) {
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
    const siteUrl = 'https://adibhaialpha.github.io/chitrons-archive';
    let posts = [];
    if (isMongoConnected) {
      posts = await BlogPost.find({ status: 'published' }).sort({ publishedAt: -1 });
    } else {
      posts = inMemoryPosts.filter(p => p.status === 'published');
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n`;
    xml += `  <channel>\n`;
    xml += `    <title>Chitrons Archive</title>\n`;
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
