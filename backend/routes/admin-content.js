const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const SiteSettings = require('../models/SiteSettings');
const AboutProfile = require('../models/AboutProfile');
const Homepage = require('../models/Homepage');

router.use(authMiddleware);

router.get('/settings', async (req, res) => {
  try {
    let settings = await SiteSettings.findOne();
    if (!settings) settings = await SiteSettings.create({});
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    let settings = await SiteSettings.findOne();
    if (!settings) settings = new SiteSettings();
    Object.assign(settings, req.body);
    await settings.save();
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

router.get('/homepage', async (req, res) => {
  try {
    let page = await Homepage.findOne();
    if (!page) page = await Homepage.create({});
    res.json({ page });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.put('/homepage', async (req, res) => {
  try {
    let page = await Homepage.findOne();
    if (!page) page = new Homepage();
    Object.assign(page, req.body);
    await page.save();
    res.json({ page });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save homepage' });
  }
});

router.get('/about', async (req, res) => {
  try {
    let profile = await AboutProfile.findOne();
    if (!profile) profile = await AboutProfile.create({});
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.put('/about', async (req, res) => {
  try {
    let profile = await AboutProfile.findOne();
    if (!profile) profile = new AboutProfile();
    Object.assign(profile, req.body);
    await profile.save();
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save about' });
  }
});

module.exports = router;
