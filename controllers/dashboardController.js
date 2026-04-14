const Lead = require('../models/Lead');
const Meeting = require('../models/Meeting');
const Onboarding = require('../models/Onboarding');

exports.getSummary = async (req, res) => {
  try {
    const wid = req.user.workspaceId;
    const base = { workspaceId: wid, isDeleted: false };

    const [totalLeads, inProcess, meetingsScheduled, onboardingActive] = await Promise.all([
      Lead.countDocuments(base),
      Lead.countDocuments({ ...base, stage: 'In Process' }),
      Meeting.countDocuments({ workspaceId: wid, status: 'scheduled' }),
      Onboarding.countDocuments({ workspaceId: wid, stage: { $ne: 'Onboarding Completed' } }),
    ]);

    const stageAgg = await Lead.aggregate([
      { $match: base },
      { $group: { _id: '$stage', count: { $sum: 1 } } },
    ]);
    const stageDistribution = stageAgg.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {});

    const recentLeads = await Lead.find(base)
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('name brand stage assignedTo tagColor createdAt');

    // Extend to 30 days so newly scheduled meetings always appear
    const now = new Date();
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const upcomingMeetings = await Meeting.find({
      workspaceId: wid,
      status: 'scheduled',
      scheduledAt: { $gte: now, $lte: future },
    })
      .populate('leadId', 'name brand')
      .populate('assignedTo', 'name')
      .sort({ scheduledAt: 1 })
      .limit(5);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyTrend = await Lead.aggregate([
      { $match: { ...base, createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    res.json({ totalLeads, inProcess, meetingsScheduled, onboardingActive, stageDistribution, recentLeads, upcomingMeetings, monthlyTrend });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMonthlyReport = async (req, res) => {
  try {
    const { year, month } = req.query;
    const wid = req.user.workspaceId;
    const y = parseInt(year) || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);
    const base = { workspaceId: wid, isDeleted: false, createdAt: { $gte: start, $lte: end } };
    const leadsAdded = await Lead.countDocuments(base);
    const stageAgg = await Lead.aggregate([{ $match: base }, { $group: { _id: '$stage', count: { $sum: 1 } } }]);
    const leads = await Lead.find(base).populate('assignedTo', 'name').select('name brand stage assignedTo createdAt tagColor');
    res.json({ year: y, month: m, leadsAdded, stageDistribution: stageAgg, leads });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
