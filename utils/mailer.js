'use strict';

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const defaultFrom = process.env.RESEND_FROM || 'Zenska CRM <onboarding@resend.dev>';

// ─── Verify Connection ─────────────────────────────────────────
const verifyConnection = () => {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[MAIL] ⚠ RESEND_API_KEY not set');
  } else {
    console.log(`[MAIL] ✅ Resend ready (from: ${defaultFrom})`);
  }
};

// ─── Send Mail ─────────────────────────────────────────────────
const sendMail = async ({ to, subject, html, text, from = defaultFrom }) => {
  if (!process.env.RESEND_API_KEY) {
    const msg = 'RESEND_API_KEY is missing in environment variables';
    console.error(`[MAIL] ❌ ${msg}`);
    throw new Error(msg);
  }

  try {
    const response = await resend.emails.send({
      from,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
    });

    if (response?.error) {
      throw new Error(response.error.message || 'Resend rejected the email request');
    }

    console.log(`[MAIL] ✅ Email Sent → ${to}${response?.data?.id ? ` (id: ${response.data.id})` : ''}`);
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
