'use strict';

const { Resend } = require('resend');

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Verify Connection ─────────────────────────────────────────
const verifyConnection = () => {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[MAIL] ⚠ RESEND_API_KEY not set');
  } else {
    console.log('[MAIL] ✅ Resend ready');
  }
};

// ─── Send Mail ─────────────────────────────────────────────────
const sendMail = async ({ to, subject, html, text }) => {
  if (!process.env.RESEND_API_KEY) {
    const msg = 'RESEND_API_KEY is missing in environment variables';
    console.error(`[MAIL] ❌ ${msg}`);
    throw new Error(msg);
  }

  try {
    const response = await resend.emails.send({
      from: 'Zenska CRM <onboarding@resend.dev>', // default sender (works instantly)
      to,
      subject,
      html,
      ...(text ? { text } : {}),
    });

    console.log(`[MAIL] ✅ Email Sent → ${to}`);
    return response;
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
