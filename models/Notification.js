const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  type:        { type: String, enum: ['mention', 'stage_change', 'meeting'], default: 'mention' },
  message:     { type: String, required: true },
  leadId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
  fromUser:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isRead:      { type: Boolean, default: false, index: true },
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
