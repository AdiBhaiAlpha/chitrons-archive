const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [300, 'Title too long']
  },
  slug: {
    type: String,
    unique: true,
    index: true
  },
  excerpt: {
    type: String,
    required: [true, 'Excerpt is required'],
    trim: true,
    maxlength: [600, 'Excerpt too long']
  },
  content: {
    type: String,
    default: ''
  },
  coverImage: {
    type: String,
    default: ''
  },
  author: {
    type: String,
    default: 'Chitron Bhattacharjee'
  },
  category: {
    type: String,
    default: 'general',
    trim: true,
    lowercase: true
  },
  labels: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  status: {
    type: String,
    enum: ['draft', 'published', 'scheduled', 'trashed'],
    default: 'draft',
    index: true
  },
  publishedAt: { type: Date, default: null },
  scheduledAt: { type: Date, default: null },
  readingTime: { type: Number, default: 1 },
  viewCount: { type: Number, default: 0 },
  seoTitle: { type: String, default: '' },
  seoDescription: { type: String, default: '' },
  canonicalUrl: { type: String, default: '' },
  featured: { type: Boolean, default: false },
  commentsEnabled: { type: Boolean, default: true }
}, {
  timestamps: true
});

blogPostSchema.index({ title: 'text', excerpt: 'text', content: 'text', labels: 'text' });
blogPostSchema.index({ publishedAt: -1 });
blogPostSchema.index({ category: 1 });
blogPostSchema.index({ labels: 1 });
blogPostSchema.index({ slug: 1 });

blogPostSchema.pre('save', function(next) {
  if (this.isModified('content')) {
    const text = this.content.replace(/<[^>]*>/g, '');
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    this.readingTime = Math.max(1, Math.ceil(words / 200));
  }
  next();
});

module.exports = mongoose.model('BlogPost', blogPostSchema);
