const express = require('express');
const router = express.Router();
const SiteSettings = require('../models/SiteSettings');
const AboutProfile = require('../models/AboutProfile');
const Homepage = require('../models/Homepage');

router.get('/settings', async (req, res) => {
  try {
    let settings = await SiteSettings.findOne();
    if (!settings) settings = await SiteSettings.create({});
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.get('/homepage', async (req, res) => {
  try {
    let page = await Homepage.findOne();
    if (!page) page = await Homepage.create({});
    res.json({ page });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch homepage' });
  }
});

router.get('/about', async (req, res) => {
  try {
    let profile = await AboutProfile.findOne();
    if (!profile) profile = await AboutProfile.create({});
    res.json({ profile });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch about' });
  }
});

module.exports = router;
