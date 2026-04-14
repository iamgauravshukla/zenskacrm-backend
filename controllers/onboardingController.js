const Onboarding = require('../models/Onboarding');
const Lead = require('../models/Lead');
const AuditLog = require('../models/AuditLog');
const { ONBOARDING_STAGES } = require('../models/Onboarding');

exports.getAll = async (req, res) => {
  try {
    const { stage, brand, assignedTo } = req.query;
    const wsId = req.user.workspaceId._id || req.user.workspaceId;

    const pipeline = [
      { $match: { workspaceId: wsId, ...(stage ? { stage } : {}), ...(assignedTo ? { assignedTo: new (require('mongoose').Types.ObjectId)(assignedTo) } : {}) } },
      { $lookup: { from: 'leads', localField: 'leadId', foreignField: '_id', as: 'leadId' } },
      { $unwind: '$leadId' },
      ...(brand ? [{ $match: { 'leadId.brand': brand } }] : []),
      { $lookup: { from: 'users', localField: 'assignedTo', foreignField: '_id', as: 'assignedTo' } },
      { $unwind: { path: '$assignedTo', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'users', localField: 'lastUpdatedBy', foreignField: '_id', as: 'lastUpdatedBy' } },
      { $unwind: { path: '$lastUpdatedBy', preserveNullAndEmptyArrays: true } },
      { $sort: { updatedAt: -1 } },
      { $project: {
        leadId: { _id: 1, name: 1, brand: 1, phone: 1, email: 1, tagColor: 1 },
        workspaceId: 1, stage: 1, notes: 1, createdAt: 1, updatedAt: 1,
        'assignedTo._id': 1, 'assignedTo.name': 1, 'assignedTo.email': 1,
        'lastUpdatedBy._id': 1, 'lastUpdatedBy.name': 1,
      }},
    ];

    const onboardings = await require('../models/Onboarding').aggregate(pipeline);
    res.json(onboardings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getByLead = async (req, res) => {
  try {
    const onboarding = await Onboarding.findOne({ leadId: req.params.leadId, workspaceId: req.user.workspaceId })
      .populate('leadId', 'name brand phone email tagColor assignedTo')
      .populate('assignedTo', 'name email')
      .populate('notes.createdBy', 'name');
    if (!onboarding) return res.status(404).json({ message: 'Onboarding record not found' });
    res.json(onboarding);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateStage = async (req, res) => {
  try {
    const { stage } = req.body;
    if (!ONBOARDING_STAGES.includes(stage))
      return res.status(400).json({ message: 'Invalid onboarding stage' });

    const onboarding = await Onboarding.findOneAndUpdate(
      { _id: req.params.id, workspaceId: req.user.workspaceId },
      { stage, lastUpdatedBy: req.user._id },
      { new: true }
    );
    if (!onboarding) return res.status(404).json({ message: 'Not found' });

    // Sync lead stage
    const leadStage = stage === 'Onboarding Completed' ? 'Onboarding Completed' : 'Onboarding Started';
    await Lead.findByIdAndUpdate(onboarding.leadId, { stage: leadStage, lastUpdatedBy: req.user._id });

    res.json(onboarding);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addNote = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim())
      return res.status(400).json({ message: 'Note content is required' });
    // Find first to capture current stage, then push note with it
    const existing = await Onboarding.findOne({ _id: req.params.id, workspaceId: req.user.workspaceId });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    const onboarding = await Onboarding.findByIdAndUpdate(
      existing._id,
      { $push: { notes: { content: content.trim(), stage: existing.stage, createdBy: req.user._id } }, lastUpdatedBy: req.user._id },
      { new: true }
    ).populate('notes.createdBy', 'name');
    res.json(onboarding);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
