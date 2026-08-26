const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const loginAttemptSchema = new mongoose.Schema({
  ip: { type: String, index: true },
  count: { type: Number, default: 0 },
  start: { type: Date, default: Date.now }
});
const LoginAttempt = mongoose.models.LoginAttempt || mongoose.model('LoginAttempt', loginAttemptSchema);

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

async function isRateLimited(ip) {
  try {
    const record = await LoginAttempt.findOne({ ip });
    if (!record) return false;
    if (Date.now() - record.start.getTime() > WINDOW_MS) {
      await LoginAttempt.deleteOne({ ip });
      return false;
    }
    return record.count >= MAX_ATTEMPTS;
  } catch (err) {
    return false;
  }
}

async function recordAttempt(ip) {
  try {
    const record = await LoginAttempt.findOne({ ip });
    if (record && Date.now() - record.start.getTime() > WINDOW_MS) {
      await LoginAttempt.deleteOne({ ip });
      await LoginAttempt.create({ ip, count: 1, start: new Date() });
    } else if (record) {
      record.count++;
      await record.save();
    } else {
      await LoginAttempt.create({ ip, count: 1, start: new Date() });
    }
  } catch (err) {
    console.error('Rate limit record error:', err);
  }
}

router.post('/login', async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const { pin } = req.body;

  if (await isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  if (!pin) {
    return res.status(400).json({ error: 'PIN required' });
  }

  if (String(pin) === String(process.env.ADMIN_PIN)) {
    req.session.isAdmin = true;
    await LoginAttempt.deleteOne({ ip }).catch(() => {});
    return res.json({ success: true });
  }

  await recordAttempt(ip);
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
