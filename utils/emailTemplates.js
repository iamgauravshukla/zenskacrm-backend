'use strict';

// Shared wrapper for all transactional emails
const wrap = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:16px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#4f6ef7;padding:28px 32px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:rgba(255,255,255,0.2);width:40px;height:40px;
                            border-radius:10px;text-align:center;vertical-align:middle;">
                  <span style="color:#fff;font-size:20px;font-weight:700;">Z</span>
                </td>
                <td style="padding-left:12px;color:#fff;font-size:18px;font-weight:600;">
                  Zenska CRM
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr><td style="padding:32px;">${content}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
              You received this email because you have an account at Zenska CRM.<br/>
              If you did not request this, you can safely ignore this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ─── Forgot Password Email ─────────────────────────────────────────────────────
const forgotPasswordHtml = ({ name, resetUrl }) => wrap(`
  <h2 style="margin:0 0 8px;color:#1e293b;font-size:22px;">Reset your password</h2>
  <p style="color:#64748b;margin:0 0 24px;font-size:15px;line-height:1.6;">
    Hi <strong style="color:#1e293b;">${name}</strong>, we received a request to reset
    your Zenska CRM password. Click the button below — the link expires in <strong>1 hour</strong>.
  </p>
  <div style="text-align:center;margin-bottom:28px;">
    <a href="${resetUrl}"
       style="display:inline-block;background:#4f6ef7;color:#fff;padding:14px 36px;
              border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
      Reset Password
    </a>
  </div>
  <p style="color:#94a3b8;font-size:13px;margin:0;">
    Or copy this link into your browser:<br/>
    <span style="color:#4f6ef7;word-break:break-all;">${resetUrl}</span>
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
  <p style="color:#94a3b8;font-size:12px;margin:0;">
    If you didn't request a password reset, your account is safe — just ignore this email.
  </p>
`);

// ─── Login Notification Email ─────────────────────────────────────────────────
const loginNotificationHtml = ({ name, time, ip }) => wrap(`
  <h2 style="margin:0 0 8px;color:#1e293b;font-size:22px;">New sign-in to your account</h2>
  <p style="color:#64748b;margin:0 0 20px;font-size:15px;line-height:1.6;">
    Hi <strong style="color:#1e293b;">${name}</strong>, a new sign-in to your
    Zenska CRM account was detected.
  </p>
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;
                margin-bottom:24px;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 8px;font-size:13px;color:#64748b;">DATE &amp; TIME</p>
        <p style="margin:0;font-size:15px;color:#1e293b;font-weight:500;">${time}</p>
      </td>
    </tr>
    ${ip ? `<tr><td style="padding:0 20px 16px;">
      <p style="margin:0 0 8px;font-size:13px;color:#64748b;">IP ADDRESS</p>
      <p style="margin:0;font-size:15px;color:#1e293b;font-weight:500;">${ip}</p>
    </td></tr>` : ''}
  </table>
  <p style="color:#64748b;font-size:14px;margin:0;">
    If this was you, no action is needed.<br/>
    If you <strong>don't recognise this sign-in</strong>, please
    <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/forgot-password"
       style="color:#4f6ef7;">reset your password immediately</a>.
  </p>
`);

// ─── Team Invitation Email ────────────────────────────────────────────────────
const inviteEmailHtml = ({ inviteeName, inviterName, workspaceName, inviteUrl, tempPassword, email }) => wrap(`
  <h2 style="margin:0 0 8px;color:#1e293b;font-size:22px;">You've been invited! 🎉</h2>
  <p style="color:#64748b;margin:0 0 20px;font-size:15px;line-height:1.6;">
    Hi <strong style="color:#1e293b;">${inviteeName}</strong>,<br/>
    <strong style="color:#1e293b;">${inviterName}</strong> has invited you to join
    <strong style="color:#1e293b;">${workspaceName || 'their workspace'}</strong> on Zenska CRM.
    Click the button below to accept and set up your account.
  </p>
  <div style="text-align:center;margin-bottom:28px;">
    <a href="${inviteUrl}"
       style="display:inline-block;background:#4f6ef7;color:#fff;padding:14px 36px;
              border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
      Accept Invitation →
    </a>
  </div>
  <div style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;padding:16px 20px;margin-bottom:20px;">
    <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#374151;">Temporary credentials</p>
    <p style="margin:0 0 4px;font-size:14px;color:#64748b;">
      Email: <strong style="color:#1e293b;">${email}</strong>
    </p>
    <p style="margin:0 0 10px;font-size:14px;color:#64748b;">
      Temp password: <strong style="color:#1e293b;">${tempPassword}</strong>
    </p>
    <p style="margin:0;font-size:12px;color:#94a3b8;">
      ⚠ You'll be prompted to set a new password when you accept the invite.
    </p>
  </div>
  <p style="color:#94a3b8;font-size:13px;margin:0 0 8px;">
    Or copy this link into your browser:<br/>
    <span style="color:#4f6ef7;word-break:break-all;">${inviteUrl}</span>
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>
  <p style="color:#94a3b8;font-size:12px;margin:0;">This invitation expires in 7 days.</p>
`);

module.exports = { forgotPasswordHtml, loginNotificationHtml, inviteEmailHtml };
