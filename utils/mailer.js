'use strict';

const nodemailer = require('nodemailer');

// ─── Build Transporter (cached singleton) ────────────────────────────────────
let _transporter = null;

const buildTransporter = () => {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 587; // ✅ use 587
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn(
      '[MAIL] ⚠ SMTP not configured. ' +
      'Set SMTP_HOST, SMTP_USER, and SMTP_PASS in your environment variables.'
    );
    return null;
  }

  // ✅ Stable config for Render + Gmail
  const transporterOptions = {
    host,
    port,
    secure: false, // ❗ IMPORTANT: must be false for port 587
    auth: {
      user,
      pass,
    },
  };

  _transporter = nodemailer.createTransport(transporterOptions);

  return _transporter;
};

// ─── Verify Connection ────────────────────────────────────────────────────────
const verifyConnection = async () => {
  const transporter = buildTransporter();
  if (!transporter) return;

  try {
    await transporter.verify();
    console.log(
      `[MAIL] ✅ SMTP Connected — ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} as ${process.env.SMTP_USER}`
    );
  } catch (err) {
    console.error(
      `[MAIL] ❌ SMTP Connection Failed\n` +
      `Host: ${process.env.SMTP_HOST}\n` +
      `Port: ${process.env.SMTP_PORT}\n` +
      `Error: ${err.message}\n` +
      `👉 Fix: Use Gmail App Password + Port 587`
    );
  }
};

// ─── Send Mail ────────────────────────────────────────────────────────────────
const sendMail = async ({ to, subject, html, text }) => {
  const transporter = buildTransporter();

  if (!transporter) {
    const msg = 'Email service not configured properly.';
    console.error(`[MAIL] ❌ Cannot send email → ${msg}`);
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
      `[MAIL] ✅ Email Sent → ${to} | Subject: "${subject}" | ID: ${info.messageId}`
    );

    return info;
  } catch (err) {
    console.error(
      `[MAIL] ❌ Email Failed → ${to}\n` +
      `Subject: ${subject}\n` +
      `Error: ${err.message}`
    );
    throw err;
  }
};

module.exports = {
  sendMail,
  verifyConnection,
};
