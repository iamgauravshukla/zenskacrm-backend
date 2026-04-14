'use strict';

const nodemailer = require('nodemailer');

// ─── Build Transporter (cached singleton) ────────────────────────────────────
let _transporter = null;

const buildTransporter = () => {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn(
      '[MAIL] ⚠ SMTP not configured. ' +
      'Set SMTP_HOST, SMTP_USER, and SMTP_PASS in your .env file.'
    );
    return null;
  }

  const secure = port === 465;

  const opts = {
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
  };

  if (!secure) opts.requireTLS = true;

  _transporter = nodemailer.createTransport(opts);
  return _transporter;
};

// ─── Verify Connection ────────────────────────────────────────────────────────
const verifyConnection = async () => {
  const t = buildTransporter();
  if (!t) return;

  try {
    await t.verify();
    console.log(
      `[MAIL] ✅ SMTP OK — ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}` +
      ` as <${process.env.SMTP_USER}>`
    );
  } catch (err) {
    console.error(
      `[MAIL] ❌ SMTP FAILED — host=${process.env.SMTP_HOST}` +
      ` port=${process.env.SMTP_PORT}\n` +
      `       → ${err.message}\n` +
      `       Tip: Use App Password + Port 465 (SSL)`
    );
  }
};

// ─── Send Mail ────────────────────────────────────────────────────────────────
const sendMail = async ({ to, subject, html, text }) => {
  const transporter = buildTransporter();

  if (!transporter) {
    const msg =
      'Email service is not configured. ' +
      'Set SMTP_HOST, SMTP_USER, and SMTP_PASS in your .env file.';
    console.error(`[MAIL] ❌ Cannot send to ${to}: ${msg}`);
    throw new Error(msg);
  }

  const fromName = process.env.SMTP_FROM_NAME || 'Zenska CRM';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
    });

    console.log(
      `[MAIL] ✅ Sent → ${to} | "${subject}" | id=${info.messageId}`
    );

    return info;
  } catch (err) {
    console.error(
      `[MAIL] ❌ Failed → ${to} | "${subject}"\n` +
      `       Error: ${err.message}`
    );
    throw err;
  }
};

module.exports = { sendMail, verifyConnection };