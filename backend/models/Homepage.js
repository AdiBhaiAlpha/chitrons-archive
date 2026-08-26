const mongoose = require('mongoose');

const homepageSchema = new mongoose.Schema({
  heroTitle: { type: String, default: 'Chitron Bhattacharjee' },
  heroSubtitle: { type: String, default: '' },
  heroDescription: { type: String, default: '' },
  heroImage: { type: String, default: '' },
  primaryButtonText: { type: String, default: 'Read Writing' },
  primaryButtonLink: { type: String, default: './writing.html' },
  secondaryButtonText: { type: String, default: 'About Me' },
  secondaryButtonLink: { type: String, default: './about.html' },
  featuredSectionTitle: { type: String, default: 'Latest Writing' },
  featuredPostsCount: { type: Number, default: 5 }
}, { timestamps: true });

module.exports = mongoose.model('Homepage', homepageSchema);
