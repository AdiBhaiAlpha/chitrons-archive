const mongoose = require('mongoose');

const aboutProfileSchema = new mongoose.Schema({
  name: { type: String, default: 'Chitron Bhattacharjee' },
  headline: { type: String, default: "Hi, I'm Chitron Bhattacharjee." },
  shortBio: { type: String, default: '' },
  biography: { type: String, default: '' },
  profileImage: { type: String, default: '' },
  imageAlt: { type: String, default: 'Chitron Bhattacharjee' },
  roles: [{ type: String }],
  interests: [{ type: String }],
  skills: [{ type: String }],
  projects: [{
    title: String,
    description: String,
    tech: String,
    url: String
  }],
  philosophy: { type: String, default: '' },
  currentFocus: { type: String, default: '' },
  writingSection: { type: String, default: '' },
  contactLinks: [{
    name: String,
    url: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('AboutProfile', aboutProfileSchema);
