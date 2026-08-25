const mongoose = require('mongoose');

const revisionSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlogPost', required: true, index: true },
  title: String,
  content: String,
  excerpt: String,
  labels: [String],
  category: String,
  savedBy: { type: String, default: 'admin' }
}, {
  timestamps: { createdAt: 'savedAt', updatedAt: false }
});

revisionSchema.index({ postId: 1, savedAt: -1 });

module.exports = mongoose.model('Revision', revisionSchema);
