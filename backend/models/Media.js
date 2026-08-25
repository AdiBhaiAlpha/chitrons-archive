const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  url: { type: String, required: true },
  alt: { type: String, default: '' },
  caption: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  size: { type: Number, default: 0 }
}, {
  timestamps: true
});

module.exports = mongoose.model('Media', mediaSchema);
