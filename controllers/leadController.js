const fs  = require('fs');
const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const AuditLog = require('../models/AuditLog');
const Remark = require('../models/Remark');
const Import = require('../models/Import');
const Onboarding = require('../models/Onboarding');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const logChanges = async (leadId, workspaceId, userId, oldData, newData) => {
  const fields = ['name','phone','email','brand','tagColor','stage','assignedTo','challenges','remarks'];
  const logs = [];
  for (const field of fields) {
    if (String(oldData[field] ?? '') !== String(newData[field] ?? '')) {
      logs.push({ leadId, workspaceId, field, oldValue: oldData[field], newValue: newData[field], changedBy: userId });
    }
  }
  if (logs.length) await AuditLog.insertMany(logs);
};

const resolve = (row, keys) => {
  for (const k of keys) {
    if (row[k] !== undefined && String(row[k]).trim() !== '') return String(row[k]).trim();
    const hit = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
    if (hit && String(row[hit]).trim() !== '') return String(row[hit]).trim();
  }
  return '';
};

const normalizePhone = (p) => (p || '').replace(/[^\d+]/g, '');

// Detect if the CSV is a Meta Ads export by checking headers
const isMetaAdsCSV = (headers) => {
  const lower = headers.map(h => h.trim().toLowerCase());
  // Strong signals: Meta-specific field names
  if (lower.includes('full_name') || lower.includes('phone_number') ||
      lower.includes('ad_id') || lower.includes('campaign_id') || lower.includes('form_id') ||
      lower.includes('adset_id') || lower.includes('form_name') || lower.includes('lead_id')) {
    return true;
  }
  // Weak signal: has 'created_time' (Meta always exports this) AND a phone/name field
  if (lower.includes('created_time') &&
      (lower.includes('phone') || lower.includes('name') || lower.includes('email'))) {
    return true;
  }
  return false;
};

// System/internal columns to always ignore (never store as visible lead attributes)
const IGNORED_COLUMNS = new Set([
  'id', 'lead_id', 'ad_id', 'ad_name', 'adset_id', 'adset_name',
  'campaign_id', 'campaign_name', 'form_id', 'form_name',
  'is_organic', 'platform', 'lead_status', 'created_time',
]);

// Known columns that map to existing Lead schema fields (case-insensitive)
const KNOWN_COLUMN_ALIASES = {
  name: ['name','full_name','full name','fullname','client name','contact name','lead name','customer name','your name','name of the person'],
  phone: ['phone','phone_number','phone number','mobile','mobile number','telephone','tel','cell','contact','whatsapp','whatsapp number','contact number','your phone','your mobile'],
  email: ['email','email address','e-mail','mail','your email','email id'],
  brand: ['brand','brand name','company','organisation','organization','business','firm','your brand','brand/company name'],
  sellsOnOtherPlatform: [
    'do_you_sell_on_any_other_online_platform?',
    'do you sell on any other online platform?',
    'do you sell on any other platform?',
    'sells_on_other_platform','other_platform','sells on other platform',
    'are you selling on any other platform',
  ],
  authorizedBrand: [
    'are_you_an_authorized_seller_for_any_brand?_if_yes,_please_share_the_brand_name(s).',
    'are you an authorized seller for any brand?',
    'are you an authorized seller for any brand? if yes, please share the brand name(s).',
    'authorized_brand','brand_name','authorized_seller_brand','are you an authorized seller',
    'authorized brand name',
  ],
  challenges: [
    'what_challenges_are_you_currently_facing_while_selling_online?',
    'what challenges are you currently facing while selling online?',
    'what challenges are you facing?',
    'challenges','pain points','problem','notes','description','remarks',
    'current challenges','key challenges',
  ],
};

// Build a reverse lookup: lowercase alias → field name
const buildAliasMap = () => {
  const map = {};
  for (const [field, aliases] of Object.entries(KNOWN_COLUMN_ALIASES)) {
    for (const alias of aliases) map[alias.toLowerCase()] = field;
  }
  return map;
};
const ALIAS_MAP = buildAliasMap();

// Readable label mappings for known long CSV headers
const READABLE_LABELS = {
  'do_you_sell_on_any_other_online_platform?': 'Sells on Other Platform',
  'are_you_an_authorized_seller_for_any_brand?_if_yes,_please_share_the_brand_name(s).': 'Authorized Brand',
  'what_challenges_are_you_currently_facing_while_selling_online?': 'Challenges',
  'sells_on_other_platform': 'Sells on Other Platform',
  'authorized_brand': 'Authorized Brand',
  'other_platform': 'Other Platform',
  'brand_name': 'Brand Name',
};

// Format a raw CSV header into a readable column label.
// Rules:
//   - Known long Meta question headers → mapped via READABLE_LABELS
//   - Underscores → spaces
//   - Trailing lone "?" (nothing after) → stripped
//   - Parenthetical text → stripped
//   - Title-cased
const formatColumnLabel = (header) => {
  const lower = header.trim().toLowerCase();
  if (READABLE_LABELS[lower]) return READABLE_LABELS[lower];
  return header
    .replace(/[_]+/g, ' ')
    .replace(/\?\s*$/, '')          // strip only a trailing bare ?
    .replace(/\([^)]*\)/g, '')      // remove parenthetical text
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || header.trim();
};

// Meta Ads fields stored in metaAds sub-doc
const META_FIELDS = new Set([
  'id','lead_id','ad_id','ad_name','adset_id','adset_name',
  'campaign_id','campaign_name','form_id','form_name','platform',
  'city','state','province','country','created_time',
]);

// Escape special regex characters to prevent ReDoS
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ─── CRUD ─────────────────────────────────────────────────────────────────────

exports.getLeads = async (req, res) => {
  try {
    const { stage, brand, assignedTo, search, startDate, endDate, tagColor, source,
            page = 1, limit = 50, withOnboarding } = req.query;

    const query = { workspaceId: req.user.workspaceId, isDeleted: false };
    if (stage)      query.stage      = { $in: stage.split(',') };
    if (brand)      query.brand      = brand;
    if (assignedTo) query.assignedTo = assignedTo;
    if (tagColor)   query.tagColor   = tagColor;
    if (source)     query.source     = source;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }
    if (search) {
      const safe = escapeRegex(search.slice(0, 100)); // escape + max 100 chars
      query.$or = [
        { name:  { $regex: safe, $options: 'i' } },
        { phone: { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } },
        { brand: { $regex: safe, $options: 'i' } },
      ];
    }

    const cappedLimit = Math.min(Number(limit) || 50, 200); // never more than 200 per page
    const total = await Lead.countDocuments(query);
    const leads = await Lead.find(query)
      .populate('assignedTo', 'name email')
      .populate('lastUpdatedBy', 'name')
      .sort({ createdAt: -1 })  // newest first
      .skip((page - 1) * cappedLimit)
      .limit(cappedLimit);

    if (withOnboarding === 'true') {
      const onboardingIds = leads.filter(l => l.stage === 'Onboarding Started' || l.stage === 'Onboarding Completed').map(l => l._id);
      const onboardingMap = {};
      if (onboardingIds.length) {
        const records = await Onboarding.find({ leadId: { $in: onboardingIds } }).select('leadId stage');
        records.forEach(r => { onboardingMap[r.leadId.toString()] = r.stage; });
      }
      const enriched = leads.map(l => {
        const obj = l.toObject({ flattenMaps: true });
        if (onboardingMap[l._id.toString()]) obj.onboardingStage = onboardingMap[l._id.toString()];
        return obj;
      });
      return res.json({ leads: enriched, total, page: Number(page), pages: Math.ceil(total / cappedLimit) });
    }

    res.json({ leads, total, page: Number(page), pages: Math.ceil(total / cappedLimit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const LEAD_WRITABLE_FIELDS = [
  'name','phone','email','brand','tagColor','stage',
  'assignedTo','challenges','customFields',
  'sellsOnOtherPlatform','authorizedBrand','source',
];

exports.createLead = async (req, res) => {
  try {
    const allowed = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => LEAD_WRITABLE_FIELDS.includes(k))
    );
    const lead = await Lead.create({
      ...allowed,
      workspaceId: req.user.workspaceId,
      lastUpdatedBy: req.user._id,
      stageHistory: [{ stage: allowed.stage || 'New Lead', enteredAt: new Date(), setBy: req.user._id }],
    });
    res.status(201).json(lead);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getLead = async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, workspaceId: req.user.workspaceId })
      .populate('assignedTo', 'name email')
      .populate('lastUpdatedBy', 'name')
      .populate('stageHistory.setBy', 'name');
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const remarks = await Remark.find({ leadId: lead._id, isDeleted: false })
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    const auditLogs = await AuditLog.find({ leadId: lead._id })
      .populate('changedBy', 'name')
      .sort({ changedAt: -1 })
      .limit(50);

    res.json({ lead, remarks, auditLogs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateLead = async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, workspaceId: req.user.workspaceId });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    const oldData = lead.toObject();
    const allowed = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => LEAD_WRITABLE_FIELDS.includes(k))
    );
    Object.assign(lead, allowed);
    lead.lastUpdatedBy = req.user._id;
    await lead.save();
    await logChanges(lead._id, lead.workspaceId, req.user._id, oldData, lead.toObject());
    res.json(lead);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findOne({ _id: req.params.id, workspaceId: req.user.workspaceId });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    lead.isDeleted = true;
    lead.deletedAt = new Date();
    await lead.save();
    res.json({ message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteAllLeads = async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId._id || req.user.workspaceId;
    const result = await Lead.updateMany(
      { workspaceId, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );
    res.json({ message: `${result.modifiedCount} lead(s) deleted` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateStage = async (req, res) => {
  try {
    const { stage } = req.body;
    const { STAGES } = require('../models/Lead');
    if (!stage || !STAGES.includes(stage))
      return res.status(400).json({ message: `Invalid stage. Must be one of: ${STAGES.join(', ')}` });
    const lead = await Lead.findOne({ _id: req.params.id, workspaceId: req.user.workspaceId });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const oldStage = lead.stage;
    lead.stage = stage;
    lead.lastUpdatedBy = req.user._id;
    // Append to stageHistory
    lead.stageHistory.push({ stage, enteredAt: new Date(), setBy: req.user._id });
    await lead.save();

    await AuditLog.create({
      leadId: lead._id, workspaceId: lead.workspaceId,
      field: 'stage', oldValue: oldStage, newValue: stage, changedBy: req.user._id,
    });

    // Auto-create onboarding record
    if (stage === 'Onboarding Started') {
      const exists = await Onboarding.findOne({ leadId: lead._id });
      if (!exists) {
        await Onboarding.create({
          leadId: lead._id, workspaceId: lead.workspaceId,
          assignedTo: lead.assignedTo, lastUpdatedBy: req.user._id,
        });
      }
    }

    res.json(lead);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.assignLead = async (req, res) => {
  try {
    const { assignedTo } = req.body;
    const lead = await Lead.findOne({ _id: req.params.id, workspaceId: req.user.workspaceId });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const oldAssignee = lead.assignedTo;
    lead.assignedTo = assignedTo || null;
    lead.lastUpdatedBy = req.user._id;
    await lead.save();

    await AuditLog.create({
      leadId: lead._id, workspaceId: lead.workspaceId,
      field: 'assignedTo', oldValue: oldAssignee, newValue: assignedTo || null,
      changedBy: req.user._id,
    });

    await lead.populate('assignedTo', 'name email');
    res.json(lead);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Custom Fields Discovery ──────────────────────────────────────────────────

exports.getCustomFields = async (req, res) => {
  try {
    // Aggregate all distinct customFields keys across workspace leads
    const wsId = new mongoose.Types.ObjectId(req.user.workspaceId._id || req.user.workspaceId);
    const result = await Lead.aggregate([
      { $match: { workspaceId: wsId, isDeleted: false, customFields: { $exists: true, $ne: {} } } },
      { $project: { keys: { $objectToArray: '$customFields' } } },
      { $unwind: '$keys' },
      { $group: { _id: '$keys.k' } },
      { $sort: { _id: 1 } },
    ]);
    res.json(result.map(r => r._id));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Returns { 'New Lead': 47, 'In Process': 12, ... } — one aggregation, no lead payload.
// Used by pipeline to show badge counts without loading all cards upfront.
exports.getStageCounts = async (req, res) => {
  try {
    const wsId = new mongoose.Types.ObjectId(req.user.workspaceId._id || req.user.workspaceId);
    const result = await Lead.aggregate([
      { $match: { workspaceId: wsId, isDeleted: false } },
      { $group: { _id: '$stage', count: { $sum: 1 } } },
    ]);
    const counts = {};
    for (const r of result) counts[r._id] = r.count;
    res.json(counts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── CSV Import ───────────────────────────────────────────────────────────────

// RFC 4180-compliant CSV parser.
// Handles: quoted fields with embedded delimiters, escaped double-quotes (""),
// and newlines inside quoted fields.
const parseCSVText = (text, delimiter) => {
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; } // escaped quote ("")
        else { inQuotes = false; i++; }                     // closing quote
      } else { field += ch; i++; }
    } else {
      if (ch === '"') { inQuotes = true; i++; }
      else if (ch === delimiter) { cur.push(field); field = ''; i++; }
      else if (ch === '\r' && text[i + 1] === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; i += 2; }
      else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; i++; }
      else { field += ch; i++; }
    }
  }
  // flush last row
  if (field || cur.length > 0) { cur.push(field); if (cur.some(v => v.trim())) rows.push(cur); }
  return rows;
};

// Detect if a Buffer starts with a UTF-16 BOM or looks like UTF-16
const isUtf16 = (buf) => {
  if (buf.length < 2) return false;
  // UTF-16 LE BOM: 0xFF 0xFE
  if (buf[0] === 0xFF && buf[1] === 0xFE) return 'utf16le';
  // UTF-16 BE BOM: 0xFE 0xFF
  if (buf[0] === 0xFE && buf[1] === 0xFF) return 'utf16be';
  // Heuristic: if every other byte is 0x00, it's likely UTF-16
  let nullCount = 0;
  const check = Math.min(buf.length, 200);
  for (let i = 0; i < check; i++) { if (buf[i] === 0x00) nullCount++; }
  if (nullCount > check * 0.2) return 'utf16le'; // assume LE (most common)
  return false;
};

exports.importCSV = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const importJob = await Import.create({
    workspaceId: req.user.workspaceId, type: 'CSV',
    filename: req.file.originalname, createdBy: req.user._id,
  });

  try {
    // ── Step 1: Read raw bytes and detect encoding ──────────────────────────
    const rawBuf = fs.readFileSync(req.file.path);
    const encoding = isUtf16(rawBuf);
    let text;
    if (encoding === 'utf16le') {
      text = rawBuf.toString('utf16le');
      // Strip BOM if present
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      console.log('[CSV IMPORT] Detected UTF-16 LE encoding');
    } else if (encoding === 'utf16be') {
      // Swap bytes for BE → LE then decode
      const swapped = Buffer.alloc(rawBuf.length);
      for (let i = 0; i < rawBuf.length - 1; i += 2) {
        swapped[i] = rawBuf[i + 1];
        swapped[i + 1] = rawBuf[i];
      }
      text = swapped.toString('utf16le');
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      console.log('[CSV IMPORT] Detected UTF-16 BE encoding');
    } else {
      text = rawBuf.toString('utf8');
      // Strip UTF-8 BOM if present
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      console.log('[CSV IMPORT] Detected UTF-8 encoding');
    }

    // ── Step 2: Detect delimiter (tab, semicolon, or comma) ──────────────────
    const firstLine = text.split(/\r?\n/)[0] || '';
    const tabCount   = (firstLine.match(/\t/g) || []).length;
    const semiCount  = (firstLine.match(/;/g)  || []).length;
    const commaCount = (firstLine.match(/,/g)  || []).length;
    const delimiter  = tabCount > commaCount && tabCount >= semiCount ? '\t'
                     : semiCount > commaCount                         ? ';'
                     :                                                    ',';
    console.log(`[CSV IMPORT] Delimiter: ${ delimiter === '\t' ? 'TAB' : delimiter === ';' ? 'SEMICOLON' : 'COMMA' }`);

    // ── Step 3: Parse into rows (RFC 4180 — quoted fields, embedded delimiters,
    //            newlines inside quotes, and "" escaped quotes all handled) ───
    const parsed = parseCSVText(text, delimiter);
    if (parsed.length < 2) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ message: 'CSV file is empty or has no data rows' });
    }

    // Parse headers — deduplicate
    const rawHeaders = parsed[0].map(h => h.trim());
    const seenHeaders = {};
    const headers = rawHeaders.map(h => {
      const key = h.toLowerCase();
      if (seenHeaders[key]) { seenHeaders[key]++; return `${h}_${seenHeaders[key]}`; }
      seenHeaders[key] = 1;
      return h;
    });

    console.log(`[CSV IMPORT] Headers (${headers.length}): ${headers.join(' | ')}`);

    // Build rows as objects
    const rows = [];
    for (let i = 1; i < parsed.length; i++) {
      const vals = parsed[i];
      if (vals.every(v => !v.trim())) continue; // skip entirely blank rows
      const row = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = (vals[j] || '').trim();
      }
      rows.push(row);
    }

    console.log(`[CSV IMPORT] Total data rows parsed: ${rows.length}`);

    const isMeta = isMetaAdsCSV(headers);
    console.log(`[CSV IMPORT] Meta Ads format: ${isMeta}`);

    // ── Step 4: Process each row ────────────────────────────────────────────
    const results = [];
    const errors  = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 1;

      // Core field extraction
      const name  = resolve(row, KNOWN_COLUMN_ALIASES.name);
      const phone = normalizePhone(resolve(row, KNOWN_COLUMN_ALIASES.phone));
      const email = resolve(row, KNOWN_COLUMN_ALIASES.email).toLowerCase();

      const rowErrors = [];
      if (!name)  rowErrors.push('Missing name');
      if (!phone) rowErrors.push('Missing phone');
      else if (!isMeta && phone.replace(/\D/g, '').length < 7) rowErrors.push(`Phone too short: "${phone}"`);
      if (rowErrors.length) {
        errors.push({ row: rowNum, message: rowErrors.join('; '), data: row });
        return;
      }

      const leadData = {
        workspaceId:          req.user.workspaceId,
        name, phone,
        email:                email || undefined,
        brand:                resolve(row, KNOWN_COLUMN_ALIASES.brand) || 'No Brand',
        sellsOnOtherPlatform: resolve(row, KNOWN_COLUMN_ALIASES.sellsOnOtherPlatform) || undefined,
        authorizedBrand:      resolve(row, KNOWN_COLUMN_ALIASES.authorizedBrand) || undefined,
        challenges:           resolve(row, KNOWN_COLUMN_ALIASES.challenges) || undefined,
        source:               isMeta ? 'Meta Ads' : 'CSV',
        uploadStatus:         'Verification Complete',
        lastUpdatedBy:        req.user._id,
        stageHistory:         [{ stage: 'New Lead', enteredAt: new Date(), setBy: req.user._id }],
      };

      // Meta Ads sub-doc
      if (isMeta) {
        leadData.metaAds = {
          leadId:        resolve(row, ['id', 'lead_id']),
          adId:          resolve(row, ['ad_id']),
          adName:        resolve(row, ['ad_name']),
          adsetId:       resolve(row, ['adset_id']),
          adsetName:     resolve(row, ['adset_name']),
          campaignId:    resolve(row, ['campaign_id']),
          campaignName:  resolve(row, ['campaign_name']),
          formId:        resolve(row, ['form_id']),
          formName:      resolve(row, ['form_name']),
          platform:      resolve(row, ['platform', 'Platform']),
          city:          resolve(row, ['city', 'City']),
          state:         resolve(row, ['state', 'State', 'province']),
          country:       resolve(row, ['country', 'Country']),
          adCreatedTime: (() => {
            const raw = resolve(row, ['created_time', 'Created Time']);
            if (!raw) return undefined;
            const d = new Date(raw);
            return isNaN(d.getTime()) ? undefined : d;
          })(),
        };
      }

      // Dynamic / custom fields
      const customFields = {};
      const seenKeys = new Set();
      for (const [rawHeader, rawVal] of Object.entries(row)) {
        const header = rawHeader.trim();
        const headerLower = header.toLowerCase();
        const val = String(rawVal || '').trim();
        if (!val) continue;

        if (IGNORED_COLUMNS.has(headerLower)) continue;
        if (ALIAS_MAP[headerLower]) continue;
        if (META_FIELDS.has(headerLower)) continue;

        const safeKey = formatColumnLabel(header).replace(/[.$]/g, '_');
        if (seenKeys.has(safeKey)) continue; // prevent duplicate keys
        seenKeys.add(safeKey);
        customFields[safeKey] = val;
      }

      // Add mapped schema fields with readable labels
      if (leadData.name) customFields['Lead'] = leadData.name;
      if (leadData.email) customFields['Email'] = leadData.email;
      if (leadData.sellsOnOtherPlatform) customFields['Sells on Other Platform'] = leadData.sellsOnOtherPlatform;
      if (leadData.authorizedBrand) customFields['Authorized Brand'] = leadData.authorizedBrand;
      if (leadData.challenges) customFields['Challenges'] = leadData.challenges;

      if (Object.keys(customFields).length > 0) {
        leadData.customFields = customFields;
      }

      results.push(leadData);
    });

    console.log(`[CSV IMPORT] Valid leads to insert: ${results.length}, Errors/skipped rows: ${errors.length}`);

    // ── Step 5: Batch-dedup then bulk-insert ───────────────────────────────
    let successCount = 0, skippedCount = 0;
    const duplicates = [];
    const newCustomFieldNames = new Set();

    // Normalize both sides so "+919876543210" and "919876543210" are treated as the same
    const normalizeForDedup = (p) => (p || '').replace(/^\+/, '').replace(/[^\d]/g, '');

    // Only query the phones that actually appear in the file — avoids loading all workspace leads
    const phonesInFile = results.map(r => normalizeForDedup(r.phone)).filter(Boolean);
    const existingLeads = phonesInFile.length
      ? await Lead.find({
          workspaceId: req.user.workspaceId,
          isDeleted: false,
          $or: [
            { phone: { $in: phonesInFile } },
            { phone: { $in: phonesInFile.map(p => '+' + p) } },
            { phone: { $in: phonesInFile.map(p => '+91' + p.replace(/^91/, '')) } },
          ],
        }).select('phone name _id').lean()
      : [];

    const existingPhoneMap = {};
    for (const l of existingLeads) {
      existingPhoneMap[normalizeForDedup(l.phone)] = l;
    }

    // Track phones seen within this file (normalized) to catch intra-file dupes
    const seenInFile = new Set(Object.keys(existingPhoneMap));
    const toInsert = [];

    for (const lead of results) {
      const normPhone = normalizeForDedup(lead.phone);
      if (seenInFile.has(normPhone)) {
        skippedCount++;
        const existing = existingPhoneMap[normPhone];
        duplicates.push({ name: lead.name, phone: lead.phone, existingId: existing?._id || null });
        continue;
      }
      seenInFile.add(normPhone);
      toInsert.push(lead);
      if (lead.customFields) {
        for (const key of Object.keys(lead.customFields)) newCustomFieldNames.add(key);
      }
    }

    if (toInsert.length > 0) {
      // Assign incrementing createdAt timestamps (1 ms apart) so CSV row order is
      // preserved and the most-recently-imported batch appears newest in the table.
      const importedAt = Date.now();
      const docsWithTs = toInsert.map((lead, i) => ({
        ...lead,
        createdAt: new Date(importedAt + i),
        updatedAt: new Date(importedAt + i),
      }));
      await Lead.insertMany(docsWithTs, { ordered: false });
    }
    successCount = toInsert.length;

    console.log(`[CSV IMPORT] Inserted: ${successCount}, Duplicates skipped: ${skippedCount}, Row errors: ${errors.length}`);

    importJob.status = 'completed';
    importJob.totalRows = rows.length;
    importJob.successCount = successCount;
    importJob.skippedCount = skippedCount;
    importJob.errorCount = errors.length;
    importJob.errors = errors;
    await importJob.save();

    try { fs.unlinkSync(req.file.path); } catch (_) {}

    res.json({
      message: `Import complete${isMeta ? ' (Meta Ads format detected)' : ''}`,
      successCount, skippedCount, errorCount: errors.length,
      errors: errors.slice(0, 20), duplicates,
      newCustomFields: [...newCustomFieldNames],
    });
  } catch (err) {
    console.error('[CSV IMPORT] Fatal error:', err);
    importJob.status = 'failed'; await importJob.save();
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.status(500).json({ message: err.message });
  }
};

// ─── Remarks ──────────────────────────────────────────────────────────────────

exports.addRemark = async (req, res) => {
  try {
    const { content, mentions } = req.body;
    const Notification = require('../models/Notification');

    const lead = await Lead.findOne({ _id: req.params.id, workspaceId: req.user.workspaceId });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    const remark = await Remark.create({
      leadId: req.params.id,
      workspaceId: req.user.workspaceId,
      content,
      mentions: mentions || [],
      createdBy: req.user._id,
    });
    await remark.populate('createdBy', 'name');

    if (mentions && mentions.length > 0) {
      const User = require('../models/User');
      const mentionedUsers = await User.find({ _id: { $in: mentions } }).select('name email');
      await Notification.insertMany(mentions.map(uid => ({
        userId: uid,
        workspaceId: req.user.workspaceId,
        type: 'mention',
        message: `${req.user.name} mentioned you in a remark on "${lead.name}"`,
        leadId: lead._id,
        fromUser: req.user._id,
      })));
      // Send email notifications to mentioned users
      const { sendMail } = require('../utils/mailer');
      for (const u of mentionedUsers) {
        const leadUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/leads/${lead._id}`;
        await sendMail({
          to: u.email,
          subject: `${req.user.name} mentioned you in Zenska CRM`,
          html: `<div style="font-family:sans-serif;padding:24px;max-width:480px;margin:0 auto;">
            <h3>${req.user.name} mentioned you</h3>
            <p>In a remark on lead <strong>${lead.name}</strong>:</p>
            <blockquote style="border-left:3px solid #4f6ef7;padding-left:12px;color:#374151;">${content}</blockquote>
            <a href="${leadUrl}" style="display:inline-block;background:#4f6ef7;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;margin-top:16px;">View Lead</a>
          </div>`,
        }).catch(() => {});
      }
    }

    res.status(201).json(remark);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteRemark = async (req, res) => {
  try {
    const remark = await Remark.findOneAndUpdate(
      { _id: req.params.remarkId, createdBy: req.user._id },
      { isDeleted: true }, { new: true }
    );
    if (!remark) return res.status(404).json({ message: 'Remark not found' });
    res.json({ message: 'Remark deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
