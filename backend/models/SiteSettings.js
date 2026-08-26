const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema({
  siteName: { type: String, default: 'Chitrons Archive' },
  tagline: { type: String, default: 'Notes, ideas, experiments and things worth remembering.' },
  authorName: { type: String, default: 'Chitron Bhattacharjee' },
  authorTitle: { type: String, default: 'AI Developer, Programmer & Writer' },
  location: { type: String, default: 'Bangladesh' },
  profileImage: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  seoTitle: { type: String, default: '' },
  seoDescription: { type: String, default: '' },
  socialLinks: [{
    name: String,
    url: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
