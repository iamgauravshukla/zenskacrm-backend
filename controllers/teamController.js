const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Notification = require('../models/Notification');
const { sendMail }        = require('../utils/mailer');
const { inviteEmailHtml } = require('../utils/emailTemplates');

exports.getTeam = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.user.workspaceId)
      .populate('members', 'name email role createdAt lastLogin isInvitePending');
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
    res.json(workspace.members);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.inviteMember = async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) return res.status(400).json({ message: 'Name and email required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'User already exists with this email' });

    // Generate a secure invite token (raw) and store its hash
    const inviteToken   = crypto.randomBytes(32).toString('hex');
    const inviteHash    = crypto.createHash('sha256').update(inviteToken).digest('hex');
    // Store plain text — the User model's pre-save hook will hash it
    const tempPassword = Math.random().toString(36).slice(-10);

    const user = await User.create({
      name, email,
      passwordHash:    tempPassword,
      workspaceId:     req.user.workspaceId,
      role:            role || 'member',
      inviteToken:     inviteHash,
      inviteExpires:   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      isInvitePending: true,
    });

    const workspace = await Workspace.findById(req.user.workspaceId);
    workspace.members.push(user._id);
    await workspace.save();

    const inviteUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/accept-invite?token=${inviteToken}`;

    // Send email — propagate SMTP errors so the caller is notified
    let emailWarning = null;
    try {
      // Reuse the already-fetched workspace (avoid second DB query)
      await sendMail({
        to:      email,
        subject: `${req.user.name} invited you to join Zenska CRM`,
        html:    inviteEmailHtml({
          inviteeName:   name,
          inviterName:   req.user.name,
          workspaceName: workspace?.name,
          inviteUrl,
          tempPassword,
          email,
        }),
      });
    } catch (mailErr) {
      console.error('[inviteMember] Email failed:', mailErr.message);
      emailWarning = mailErr.message;
    }

    // In-app notification for the invited user (visible once they log in)
    await Notification.create({
      userId: user._id,
      workspaceId: req.user.workspaceId,
      type: 'mention',
      message: `Welcome to the workspace! ${req.user.name} has invited you.`,
      fromUser: req.user._id,
    });

    res.status(201).json({
      user,
      tempPassword,
      inviteUrl,
      emailWarning,
      message: emailWarning
        ? `User created but email could not be sent: ${emailWarning}. Share the invite link manually.`
        : 'Invitation sent via email.',
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.acceptInvite = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res.status(400).json({ message: 'Token and password are required' });
    if (password.length < 8)
      return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      inviteToken: hash,
      isInvitePending: true,
      inviteExpires: { $gt: new Date() },
    });
    if (!user) return res.status(400).json({ message: 'Invalid or expired invitation link' });

    // Assign plain text — the User model's pre-save hook will hash it
    user.passwordHash    = password;
    user.inviteToken     = undefined;
    user.inviteExpires   = undefined;
    user.isInvitePending = false;
    await user.save();

    const jwt = require('jsonwebtoken');
    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token: jwtToken, user, message: 'Account activated!' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createMember = async (req, res) => {
  try {
    const { name, email, role, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required' });
    if (password.length < 8)
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    if (!['admin', 'member'].includes(role))
      return res.status(400).json({ message: 'Invalid role' });

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ message: 'A user with this email already exists' });

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      passwordHash: password,          // pre-save hook will bcrypt this
      workspaceId:  req.user.workspaceId,
      role:         role || 'member',
      isInvitePending: false,
    });

    const workspace = await Workspace.findById(req.user.workspaceId);
    workspace.members.push(user._id);
    await workspace.save();

    await Notification.create({
      userId:      user._id,
      workspaceId: req.user.workspaceId,
      type:        'mention',
      message:     `Welcome! ${req.user.name} added you to the workspace.`,
      fromUser:    req.user._id,
    });

    const { passwordHash: _, ...safeUser } = user.toObject();
    res.status(201).json({ user: safeUser, message: 'Member created successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateMemberRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin', 'member'].includes(role))
      return res.status(400).json({ message: 'Invalid role. Must be admin or member' });
    const user = await User.findOneAndUpdate(
      { _id: req.params.userId, workspaceId: req.user.workspaceId },
      { role }, { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user._id.toString())
      return res.status(400).json({ message: 'Cannot remove yourself' });
    // Remove from workspace members list AND clear the user's workspaceId so their
    // JWT stops granting access immediately on next request.
    await Promise.all([
      Workspace.findByIdAndUpdate(req.user.workspaceId, { $pull: { members: userId } }),
      User.findByIdAndUpdate(userId, { $unset: { workspaceId: '' } }),
    ]);
    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
