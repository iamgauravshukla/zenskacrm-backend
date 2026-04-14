'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:                  { type: String, required: true, trim: true },
  email:                 { type: String, required: true, unique: true, lowercase: true, trim: true },
  // This field stores the HASHED password.
  // Always assign a PLAIN-TEXT password — the pre-save hook below hashes it.
  // Never pre-hash before assigning, or the hook will double-hash.
  passwordHash:          { type: String, required: true },
  workspaceId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
  role:                  { type: String, enum: ['admin', 'member'], default: 'member' },
  lastLogin:             { type: Date },
  resetPasswordToken:    { type: String },
  resetPasswordExpires:  { type: Date },
  // Invited members
  inviteToken:           { type: String },
  inviteExpires:         { type: Date },
  isInvitePending:       { type: Boolean, default: false },
}, { timestamps: true });

// ─── Hash password before save ─────────────────────────────────────────────────
// This is the SINGLE place where hashing happens.
// Controllers should always set user.passwordHash = plainTextPassword
// and let this hook do the hashing.
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();

  // If the value is already a bcrypt hash (60 chars, starts with $2),
  // skip hashing — this prevents accidental double-hashing.
  if (
    typeof this.passwordHash === 'string' &&
    this.passwordHash.startsWith('$2') &&
    this.passwordHash.length === 60
  ) {
    return next();
  }

  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// ─── Compare password ──────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

// ─── Strip sensitive fields from JSON responses ────────────────────────────────
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.resetPasswordToken;
  delete obj.inviteToken;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
