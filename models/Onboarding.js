const mongoose = require('mongoose');

const ONBOARDING_STAGES = [
  'Onboarding Started',
  'Requirement Discussion',
  'Documents Collected',
  'Offer / Invite Sent',
  'Final Confirmation',
  'Onboarding Completed',
];

const noteSchema = new mongoose.Schema({
  content: { type: String, required: true },
  stage: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const onboardingSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, unique: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  stage: { type: String, enum: ONBOARDING_STAGES, default: 'Onboarding Started', index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  notes: [noteSchema],
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

onboardingSchema.index({ workspaceId: 1, stage: 1 });
onboardingSchema.index({ workspaceId: 1, updatedAt: -1 });

module.exports = mongoose.model('Onboarding', onboardingSchema);
module.exports.ONBOARDING_STAGES = ONBOARDING_STAGES;
