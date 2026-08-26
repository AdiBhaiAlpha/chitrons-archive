const mongoose = require('mongoose');

const homepageSchema = new mongoose.Schema({
  heroTitle: { type: String, default: 'Chitron Bhattacharjee' },
  heroDescription: { type: String, default: '' },
  primaryButtonText: { type: String, default: 'Read Writing' },
  primaryButtonLink: { type: String, default: './writing.html' },
  secondaryButtonText: { type: String, default: 'About Me' },
  secondaryButtonLink: { type: String, default: './about.html' },
  featuredSectionTitle: { type: String, default: 'Latest Writing' }
}, { timestamps: true });

module.exports = mongoose.model('Homepage', homepageSchema);
