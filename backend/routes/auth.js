const express = require('express');
const router = express.Router();

const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.start > WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function recordAttempt(ip) {
  const record = loginAttempts.get(ip) || { count: 0, start: Date.now() };
  record.count++;
  loginAttempts.set(ip, record);
}

router.post('/login', (req, res) => {
  const ip = req.ip;
  const { pin } = req.body;

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  if (!pin) {
    return res.status(400).json({ error: 'PIN required' });
  }

  if (String(pin) === String(process.env.ADMIN_PIN)) {
    req.session.isAdmin = true;
    loginAttempts.delete(ip);
    return res.json({ success: true });
  }

  recordAttempt(ip);
  return res.status(401).json({ error: 'Invalid PIN' });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

module.exports = router;
