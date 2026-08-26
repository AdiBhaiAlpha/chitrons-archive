const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const requiredVars = ['MONGODB_URI', 'ADMIN_PIN', 'SESSION_SECRET', 'FRONTEND_URL'];
const missing = requiredVars.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error('FATAL: Missing required environment variables:', missing.join(', '));
  console.error('Ensure backend/.env exists and contains:', requiredVars.join(', '));
  process.exit(1);
}

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

const frontendOrigin = (function (url) {
  try { return new URL(url).origin; }
  catch { return url.replace(/\/+$/, ''); }
})(process.env.FRONTEND_URL);

const allowedOrigins = [frontendOrigin, 'http://localhost:3000', 'http://localhost:8080'];
const configLoaded = requiredVars.every((v) => !!process.env[v]);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    configuration: configLoaded ? 'loaded' : 'missing',
    timestamp: new Date().toISOString()
  });
});

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
    }).then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

const sessionStore = MongoStore.create({
  clientPromise: connectToDatabase().then((m) => m.connection.client),
  collectionName: 'sessions',
  ttl: 60 * 60 * 24,
  autoRemove: 'native'
});

app.use(async (req, res, next) => {
  if (req.path === '/api/health') return next();
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: 'none',
    maxAge: 60 * 60 * 24 * 1000,
    path: '/'
  }
}));

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/posts');
const contentRoutes = require('./routes/content');
const adminContentRoutes = require('./routes/admin-content');

app.use('/api/auth', authRoutes);
app.use('/api/posts', publicRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/content', adminContentRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS origin rejected' });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log('Configuration loaded:', configLoaded ? 'yes' : 'NO - MISSING VARS');
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
