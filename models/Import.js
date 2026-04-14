const mongoose = require('mongoose');

const importSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  type: { type: String, enum: ['CSV', 'Google Sheets'], required: true },
  filename: { type: String },
  status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
  totalRows: { type: Number, default: 0 },
  successCount: { type: Number, default: 0 },
  skippedCount: { type: Number, default: 0 },
  errorCount: { type: Number, default: 0 },
  errors: [{ row: Number, message: String }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('Import', importSchema);
