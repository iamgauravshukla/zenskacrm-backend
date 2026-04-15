# Zenska CRM — Email System Setup Guide

## Quick Start

### Step 1 — Create your `.env` file

Copy `.env.example` to `.env` in the backend folder:

```bash
cp .env.example .env
```

Then fill in your real values, especially the Resend block.

---

## Resend Configuration

### Required variables

```env
RESEND_API_KEY=re_replace_with_your_real_api_key
RESEND_FROM=Zenska CRM <no-reply@yourdomain.com>
```

### Important: test mode restriction

If your Resend account is still using the default `resend.dev` sender or an unverified domain, Resend only delivers to your own account email.

That is why forgot-password works for `gaurav.lohchab@lukasz.in` but not for other recipients.

### To send email to any user

1. Open Resend and verify your domain.
2. Add the DNS records Resend gives you.
3. Wait until the domain status becomes verified.
4. Set `RESEND_FROM` to an address on that domain, for example `Zenska CRM <no-reply@lukasztrade.com>`.
5. Restart the backend.

---

## Verifying it works

When the backend starts you should see:

```
[MAIL] ✅ Resend ready (from: Zenska CRM <no-reply@yourdomain.com>)
```

When a forgot-password email is accepted by Resend you will see:

```
[MAIL] ✅ Email Sent → user@example.com (id: ...)
```

If Resend is still in test mode, you may see:

```
[MAIL] ❌ Email Failed → user@example.com
Error: You can only send testing emails to your own email address (...)
```

That means the app is working, but your sender domain is not verified yet.

---

## Email Flows

| Trigger | Email sent | Template |
|---|---|---|
| User clicks "Forgot Password" | Reset link (expires 1 hr) | `forgotPasswordHtml` |
| User logs in successfully | Sign-in notification | `loginNotificationHtml` |
| Admin invites a team member | Invite link + temp password | `inviteEmailHtml` |
| Meeting is scheduled | Meeting details to lead | Inline in `meetingController` |
| Meeting is rescheduled | Updated meeting details | Inline in `meetingController` |
| User is @mentioned in remark | Mention notification | Inline in `leadController` |

---

## Disabling login notification emails

If you don't want users to receive an email every time they sign in, add this to `.env`:

```env
SEND_LOGIN_EMAILS=false
```

---

## Frontend `.env.local`

Create a `.env.local` file in the **frontend** root:

```env
# Local dev
NEXT_PUBLIC_API_URL=http://localhost:8000

# Production
# NEXT_PUBLIC_API_URL=https://api.zenska.ph
```

---

## Forgot Password — Full Flow

1. User visits `/forgot-password` and enters their email
2. Backend generates a secure 32-byte random token, stores its **SHA-256 hash** in MongoDB (never the plain token), and sets a 1-hour expiry
3. Reset email is sent with link: `CLIENT_URL/reset-password?token=<PLAIN_TOKEN>`
4. User clicks the link → `/reset-password` page
5. User enters new password → backend hashes the token, finds the matching user, updates the password, clears the token fields
6. User is redirected to login

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Something went wrong" on forgot-password | SMTP not configured | Fill in `.env` SMTP block |
| SMTP OK but email goes to spam | SPF/DKIM not set up | Add SPF/DKIM records in Hostinger DNS |
| "Invalid or expired reset link" | Token > 1 hour old | Request a new reset link |
| Login works but no email notification | `SEND_LOGIN_EMAILS=false` or SMTP issue | Check `.env` and server logs |
| Double-hash error after upgrade | Old users with double-hashed passwords | New users created after this fix work correctly; existing users may need a password reset |

### Checking spam / deliverability

- Add your domain's **SPF record** in Hostinger DNS:
  `v=spf1 include:hostinger.com ~all`
- Enable **DKIM** in hPanel → Emails → Email Deliverability
- Ask the recipient to check their **Spam / Junk** folder and mark as "Not Spam"

---

## Files Changed in This Fix

| File | Change |
|---|---|
| `utils/mailer.js` | Full rewrite — Hostinger TLS, logging, `verifyConnection()` |
| `utils/emailTemplates.js` | **New** — shared HTML templates for all transactional emails |
| `controllers/authController.js` | Removed double-hashing, added login notification, better error messages |
| `controllers/teamController.js` | Removed double-hashing in invite flow; uses new invite template |
| `models/User.js` | Pre-save hook is now the **only** hashing point; safety guard added |
| `server.js` | Calls `verifyConnection()` on startup |
| `.env.example` | **New** — complete Hostinger SMTP setup guide |
