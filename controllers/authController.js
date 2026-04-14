'use strict';

const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const User      = require('../models/User');
const Workspace = require('../models/Workspace');
const { sendMail }                                 = require('../utils/mailer');
const { forgotPasswordHtml, loginNotificationHtml } = require('../utils/emailTemplates');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// ─── Signup ───────────────────────────────────────────────────────────────────
exports.signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required' });
    if (password.length < 8)
      return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) return res.status(400).json({ message: 'Email already registered' });

    // NOTE: Do NOT pre-hash here — the User model's pre-save hook hashes passwordHash.
    // We store the plain password in passwordHash and the hook handles it.
    const user = await User.create({ name, email, passwordHash: password, role: 'admin' });

    res.status(201).json({ token: generateToken(user._id), user });
  } catch (err) {
    console.error('[signup]', err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─── Create Workspace ─────────────────────────────────────────────────────────
exports.createWorkspace = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim())
      return res.status(400).json({ message: 'Workspace name is required' });
    if (req.user.workspaceId)
      return res.status(400).json({ message: 'You already have a workspace' });

    const workspace = await Workspace.create({
      name: name.trim(),
      ownerId: req.user._id,
      members: [req.user._id],
    });

    await User.findByIdAndUpdate(req.user._id, { workspaceId: workspace._id });
    const updatedUser = await User.findById(req.user._id).populate('workspaceId');

    res.status(201).json({ workspace, user: updatedUser });
  } catch (err) {
    console.error('[createWorkspace]', err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    const isMatch = user && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !isMatch)
      return res.status(401).json({ message: 'Invalid credentials' });

    user.lastLogin = new Date();
    await user.save({ validateModifiedOnly: true });

    // ── Login notification email (non-blocking) ──
    if (process.env.SEND_LOGIN_EMAILS !== 'false') {
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
               || req.socket?.remoteAddress
               || null;

      sendMail({
        to:      user.email,
        subject: 'New sign-in to your Zenska CRM account',
        html:    loginNotificationHtml({
          name: user.name,
          time: new Date().toLocaleString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long',
            day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
          }),
          ip,
        }),
      }).catch((err) =>
        console.warn('[login] Login notification email failed (non-fatal):', err.message)
      );
    }

    res.json({ token: generateToken(user._id), user });
  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => res.json({ message: 'Logged out successfully' });

// ─── Get Me ───────────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('workspaceId');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Rename Workspace ────────────────────────────────────────────────────────
exports.renameWorkspace = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim())
      return res.status(400).json({ message: 'Workspace name is required' });
    if (!req.user.workspaceId)
      return res.status(400).json({ message: 'No workspace found' });

    const ws = await Workspace.findById(req.user.workspaceId._id || req.user.workspaceId);
    if (!ws) return res.status(404).json({ message: 'Workspace not found' });

    // Only the workspace owner (admin) may rename
    if (String(ws.ownerId) !== String(req.user._id))
      return res.status(403).json({ message: 'Only the workspace owner can rename it' });

    ws.name = name.trim();
    await ws.save();

    const updatedUser = await User.findById(req.user._id).populate('workspaceId');
    res.json({ workspace: ws, user: updatedUser });
  } catch (err) {
    console.error('[renameWorkspace]', err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─── Update Profile ───────────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (name) user.name = name;

    if (newPassword) {
      if (newPassword.length < 8)
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      if (!currentPassword)
        return res.status(400).json({ message: 'Current password required' });
      const ok = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!ok)
        return res.status(400).json({ message: 'Current password is incorrect' });
      // Assign plain-text — the pre-save hook will hash it
      user.passwordHash = newPassword;
    }

    await user.save();
    res.json(user);
  } catch (err) {
    console.error('[updateProfile]', err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─── Forgot Password ──────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always respond 200 — prevents email enumeration
    const okResponse = () =>
      res.json({ message: 'If that email is registered, you will receive reset instructions.' });

    if (!user) return okResponse();

    // Generate token
    const plainToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');

    user.resetPasswordToken   = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save({ validateModifiedOnly: true });

    const clientUrl  = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetUrl   = `${clientUrl}/reset-password?token=${plainToken}`;

    console.log(`[forgotPassword] Reset token generated for ${user.email}`);

    try {
      await sendMail({
        to:      user.email,
        subject: 'Zenska CRM — Reset your password',
        html:    forgotPasswordHtml({ name: user.name, resetUrl }),
      });
    } catch (mailErr) {
      console.error('[forgotPassword] ❌ Email delivery failed:', mailErr.message);
      // Do NOT return the reset URL in the response — that bypasses email verification.
      // The user must contact their admin or retry.
      return res.status(503).json({
        message: 'We could not send the reset email right now. Please try again in a few minutes or contact your administrator.',
      });
    }

    return okResponse();
  } catch (err) {
    console.error('[forgotPassword]', err.message);
    res.status(500).json({ message: err.message });
  }
};

// ─── Reset Password ───────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res.status(400).json({ message: 'Token and password are required' });
    if (password.length < 8)
      return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken:   hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user)
      return res.status(400).json({ message: 'Invalid or expired reset link. Please request a new one.' });

    // Assign plain-text — the pre-save hook will hash it
    user.passwordHash         = password;
    user.resetPasswordToken   = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    console.log(`[resetPassword] ✅ Password reset for ${user.email}`);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('[resetPassword]', err.message);
    res.status(500).json({ message: err.message });
  }
};
