const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  messageId: { type: String, required: true },
  visitorId: { type: String, required: true },
  sender: { type: String, enum: ['visitor', 'admin'], required: true },
  text: { type: String, default: '', maxlength: 4000 },
  type: { type: String, enum: ['text', 'image', 'file'], default: 'text' },
  mediaUrl: { type: String, default: '' },
  fileName: { type: String, default: '' },
  read: { type: Boolean, default: false },
  timestamp: { type: Number, required: true, default: () => Date.now() }
}, { _id: false });

const chatConversationSchema = new mongoose.Schema({
  visitorId: { type: String, required: true, unique: true, index: true },
  visitorName: { type: String, default: '' },
  visitorEmail: { type: String, default: '' },
  createdAt: { type: Number, required: true, default: () => Date.now() },
  lastMessage: { type: String, default: '' },
  lastMessageAt: { type: Number, required: true, default: () => Date.now(), index: true },
  lastSender: { type: String, enum: ['visitor', 'admin'], default: 'visitor' },
  unreadForAdmin: { type: Number, default: 0 },
  unreadForVisitor: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'archived', 'blocked'], default: 'active', index: true },
  visitorOnline: { type: Boolean, default: false },
  visitorLastSeen: { type: Number, default: () => Date.now() },
  visitorTyping: { type: Boolean, default: false },
  adminTyping: { type: Boolean, default: false },
  pageUrl: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  messages: { type: [chatMessageSchema], default: [] }
}, { timestamps: false });

module.exports = mongoose.models.ChatConversation || mongoose.model('ChatConversation', chatConversationSchema);
