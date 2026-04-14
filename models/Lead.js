const mongoose = require('mongoose');

const STAGES = [
  'New Lead','In Process','Meeting Scheduled','Meeting Completed',
  'Onboarding Started','Onboarding Completed','Offer Sent / Closed',
];

const stageHistorySchema = new mongoose.Schema({
  stage:     { type: String },
  enteredAt: { type: Date, default: Date.now },
  setBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: false });

const leadSchema = new mongoose.Schema({
  workspaceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  name:         { type: String, required: true, trim: true },
  phone:        { type: String, required: true, trim: true },
  email:        { type: String, trim: true, lowercase: true },
  brand:        { type: String, default: 'No Brand', trim: true },
  tagColor:     { type: String, default: '#6366f1' },
  source:       { type: String, enum: ['CSV','Google Sheets','Manual','Meta Ads','Web Form'], default: 'Manual' },
  sellsOnOtherPlatform: { type: String, trim: true },
  authorizedBrand:      { type: String, trim: true },
  challenges:           { type: String },
  remarks:              { type: String },
  stage:        { type: String, enum: STAGES, default: 'New Lead', index: true },
  stageHistory: { type: [stageHistorySchema], default: [] },
  assignedTo:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  uploadStatus: { type: String, enum: ['Uploaded','Verification Complete'], default: 'Verification Complete' },
  isDeleted:    { type: Boolean, default: false },
  deletedAt:    { type: Date },
  lastUpdatedBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customFields: { type: Map, of: String, default: {} },
  metaAds: {
    leadId:       String,
    adId:         String,
    adName:       String,
    adsetId:      String,
    adsetName:    String,
    campaignId:   String,
    campaignName: String,
    formId:       String,
    formName:     String,
    platform:     String,
    city:         String,
    state:        String,
    country:      String,
    adCreatedTime:Date,
  },
}, { timestamps: true });

leadSchema.index({ workspaceId: 1, brand: 1 });
leadSchema.index({ workspaceId: 1, createdAt: -1 });
leadSchema.index({ workspaceId: 1, source: 1 });
// Compound indexes for the hot query pattern: workspaceId + isDeleted + (stage / phone / assignedTo)
leadSchema.index({ workspaceId: 1, isDeleted: 1, stage: 1 });
leadSchema.index({ workspaceId: 1, isDeleted: 1, createdAt: -1 });
leadSchema.index({ workspaceId: 1, isDeleted: 1, phone: 1 });
leadSchema.index({ workspaceId: 1, isDeleted: 1, assignedTo: 1 });

module.exports = mongoose.model('Lead', leadSchema);
module.exports.STAGES = STAGES;
