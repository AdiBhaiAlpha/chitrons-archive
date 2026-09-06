const mongoose = require('mongoose');

const galleryItemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  caption: { type: String, default: '', trim: true },
  url: { type: String, required: true, trim: true },
  category: { type: String, default: 'photography', trim: true },
  tags: [{ type: String, trim: true }],
  location: { type: String, default: '', trim: true },
  alt: { type: String, default: '', trim: true },
  date: { type: Date, default: Date.now },
  featured: { type: Boolean, default: false },
  status: { type: String, enum: ['published', 'draft'], default: 'published' },
  order: { type: Number, default: 0 }
}, {
  timestamps: true
});

module.exports = mongoose.model('GalleryItem', galleryItemSchema);
