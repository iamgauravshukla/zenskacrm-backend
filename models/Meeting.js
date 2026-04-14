const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  scheduledAt: { type: Date, required: true, index: true },
  type: { type: String, enum: ['call', 'video', 'in-person'], required: true },
  status: { type: String, enum: ['scheduled', 'no-show', 'completed'], default: 'scheduled', index: true },
  outcome: { type: String },
  notes: { type: String },
  agenda: { type: String },
  meetLink: { type: String },   // video: Google Meet / Zoom / any link pasted by user
  address: { type: String },    // in-person: venue / location
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

meetingSchema.index({ workspaceId: 1, status: 1, scheduledAt: 1 });

module.exports = mongoose.model('Meeting', meetingSchema);
