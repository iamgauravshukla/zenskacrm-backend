const Meeting = require('../models/Meeting');
const Lead = require('../models/Lead');
const AuditLog = require('../models/AuditLog');
const { sendMail } = require('../utils/mailer');

// HTML-escape user-controlled values before inserting into email HTML
const esc = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

const buildMeetingEmailHtml = ({ leadName, dateStr, timeStr, typeLabel, agenda, meetLink, address }) => `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">Meeting Scheduled</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px">Zenska CRM</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.5">Hi <strong>${esc(leadName)}</strong>,</p>
      <p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.5">A meeting has been scheduled with you. Here are the details:</p>
      <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:20px;border:1px solid #e2e8f0">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:100px">Date</td><td style="padding:6px 0;color:#1e293b;font-size:14px;font-weight:600">${dateStr}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Time</td><td style="padding:6px 0;color:#1e293b;font-size:14px;font-weight:600">${timeStr}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Type</td><td style="padding:6px 0;color:#1e293b;font-size:14px;font-weight:600">${typeLabel}</td></tr>
          ${agenda ? `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;vertical-align:top">Agenda</td><td style="padding:6px 0;color:#1e293b;font-size:14px">${agenda}</td></tr>` : ''}
          ${address ? `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;vertical-align:top">Location</td><td style="padding:6px 0;color:#1e293b;font-size:14px">${address}</td></tr>` : ''}
        </table>
      </div>
      ${meetLink ? `
      <div style="text-align:center;margin:24px 0">
        <a href="${meetLink}" target="_blank" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 32px;border-radius:10px;font-size:14px;font-weight:600">Join Meeting</a>
        <p style="margin:10px 0 0;font-size:12px;color:#94a3b8">or copy link: <a href="${meetLink}" style="color:#6366f1">${meetLink}</a></p>
      </div>` : ''}
      <p style="margin:20px 0 0;color:#334155;font-size:15px;line-height:1.5">Looking forward to connecting with you!</p>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
      <p style="margin:0;color:#94a3b8;font-size:11px">Sent via Zenska CRM</p>
    </div>
  </div>`;

exports.createMeeting = async (req, res) => {
  try {
    const { leadId, scheduledAt, type, notes, agenda, assignedTo, meetLink, address } = req.body;

    // Prevent past date scheduling
    if (new Date(scheduledAt) < new Date()) {
      return res.status(400).json({ message: 'Cannot schedule a meeting in the past' });
    }

    const lead = await Lead.findOne({ _id: leadId, workspaceId: req.user.workspaceId });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const meeting = await Meeting.create({
      leadId, workspaceId: req.user.workspaceId,
      scheduledAt, type, notes, agenda,
      meetLink:   type === 'video'     ? (meetLink  || undefined) : undefined,
      address:    type === 'in-person' ? (address   || undefined) : undefined,
      assignedTo: assignedTo || lead.assignedTo,
      createdBy:  req.user._id,
    });

    // Update lead stage
    const oldStage = lead.stage;
    lead.stage = 'Meeting Scheduled';
    lead.lastUpdatedBy = req.user._id;
    await lead.save();

    await AuditLog.create({
      leadId: lead._id, workspaceId: lead.workspaceId,
      field: 'stage', oldValue: oldStage, newValue: 'Meeting Scheduled', changedBy: req.user._id,
    });

    // Send email invitation to the lead
    if (lead.email) {
      const scheduledDate = new Date(scheduledAt);
      const dateStr = scheduledDate.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      const timeStr = scheduledDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      const typeLabel = type === 'video' ? 'Video Call' : type === 'call' ? 'Phone Call' : 'In-Person Meeting';

      try {
        await sendMail({
          to: lead.email,
          subject: `Meeting Scheduled — ${dateStr} at ${timeStr}`,
          html: buildMeetingEmailHtml({
            leadName: esc(lead.name), dateStr: esc(dateStr), timeStr: esc(timeStr),
            typeLabel: esc(typeLabel), agenda: esc(agenda),
            meetLink: type === 'video' ? meetLink : undefined,
            address:  type === 'in-person' ? esc(address) : undefined,
          }),
        });
      } catch (mailErr) {
        console.warn('[MAIL] Failed to send meeting invitation:', mailErr.message);
      }
    }

    res.status(201).json(meeting);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMeetingsByLead = async (req, res) => {
  try {
    const meetings = await Meeting.find({ leadId: req.params.leadId, workspaceId: req.user.workspaceId })
      .populate('createdBy', 'name')
      .populate('assignedTo', 'name')
      .sort({ scheduledAt: -1 });
    res.json(meetings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllMeetings = async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    const query = { workspaceId: req.user.workspaceId };
    if (status) query.status = status;
    if (startDate || endDate) {
      query.scheduledAt = {};
      if (startDate) query.scheduledAt.$gte = new Date(startDate);
      if (endDate) query.scheduledAt.$lte = new Date(endDate);
    }

    const meetings = await Meeting.find(query)
      .populate('leadId', 'name brand phone')
      .populate('createdBy', 'name')
      .populate('assignedTo', 'name')
      .sort({ scheduledAt: 1 });
    res.json(meetings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.rescheduleMeeting = async (req, res) => {
  try {
    const { scheduledAt, type, notes, agenda, meetLink, address } = req.body;

    if (new Date(scheduledAt) < new Date()) {
      return res.status(400).json({ message: 'Cannot schedule a meeting in the past' });
    }

    const meeting = await Meeting.findOne({ _id: req.params.id, workspaceId: req.user.workspaceId });
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });

    const lead = await Lead.findOne({ _id: meeting.leadId, workspaceId: req.user.workspaceId });

    const oldDate = meeting.scheduledAt;
    meeting.scheduledAt = scheduledAt;
    const effectiveType = type || meeting.type;
    meeting.type = effectiveType;
    if (notes    !== undefined) meeting.notes    = notes;
    if (agenda   !== undefined) meeting.agenda   = agenda;
    // Keep link/address scoped to the correct type
    meeting.meetLink = effectiveType === 'video'     ? (meetLink || meeting.meetLink || undefined) : undefined;
    meeting.address  = effectiveType === 'in-person' ? (address  || meeting.address  || undefined) : undefined;

    await meeting.save();

    if (lead) {
      await AuditLog.create({
        leadId: lead._id, workspaceId: lead.workspaceId,
        field: 'meeting rescheduled', oldValue: oldDate, newValue: scheduledAt,
        changedBy: req.user._id,
      });

      // Send reschedule email
      if (lead.email) {
        const scheduledDate = new Date(scheduledAt);
        const dateStr = scheduledDate.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        const timeStr = scheduledDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        const typeLabel = effectiveType === 'video' ? 'Video Call' : effectiveType === 'call' ? 'Phone Call' : 'In-Person Meeting';
        try {
          await sendMail({
            to: lead.email,
            subject: `Meeting Rescheduled — ${dateStr} at ${timeStr}`,
            html: buildMeetingEmailHtml({
              leadName: esc(lead.name), dateStr: esc(dateStr), timeStr: esc(timeStr),
              typeLabel: esc(typeLabel), agenda: esc(agenda),
              meetLink: effectiveType === 'video'     ? meeting.meetLink : undefined,
              address:  effectiveType === 'in-person' ? esc(meeting.address) : undefined,
            }),
          });
        } catch (mailErr) {
          console.warn('[MAIL] Failed to send reschedule email:', mailErr.message);
        }
      }
    }

    await meeting.populate('leadId', 'name brand phone');
    await meeting.populate('assignedTo', 'name');
    res.json(meeting);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateMeetingStatus = async (req, res) => {
  try {
    const { status, outcome, notes } = req.body;
    const VALID_STATUSES = ['scheduled', 'no-show', 'completed'];
    if (!VALID_STATUSES.includes(status))
      return res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    const meeting = await Meeting.findOneAndUpdate(
      { _id: req.params.id, workspaceId: req.user.workspaceId },
      { status, outcome, notes },
      { new: true }
    ).populate('leadId', 'name brand');

    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });

    // If meeting completed, advance lead stage only if still at Meeting Scheduled
    // (prevents reverting a lead that has already advanced further)
    if (status === 'completed') {
      await Lead.findOneAndUpdate(
        { _id: meeting.leadId._id, stage: 'Meeting Scheduled' },
        { stage: 'Meeting Completed', lastUpdatedBy: req.user._id }
      );
      await AuditLog.create({
        leadId: meeting.leadId._id, workspaceId: req.user.workspaceId,
        field: 'stage', oldValue: 'Meeting Scheduled', newValue: 'Meeting Completed', changedBy: req.user._id,
      });
    }

    res.json(meeting);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getUpcoming = async (req, res) => {
  try {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const meetings = await Meeting.find({
      workspaceId: req.user.workspaceId,
      status: 'scheduled',
      scheduledAt: { $gte: now, $lte: nextWeek },
    })
      .populate('leadId', 'name brand')
      .populate('assignedTo', 'name')
      .sort({ scheduledAt: 1 });
    res.json(meetings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
