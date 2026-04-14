# Zenska CRM — Email System Setup Guide

## Quick Start

### Step 1 — Create your `.env` file

Copy `.env.example` to `.env` in the backend folder:

```bash
cp .env.example .env
```

Then fill in your real values — especially the SMTP block.

---

## SMTP Configuration (Hostinger)

### Finding your credentials

1. Log in to **hPanel** (Hostinger control panel)
2. Go to **Emails → Email Accounts**
3. Find or create the mailbox you want to send from (e.g. `admin@zenska.ph`)
4. Note the **mailbox password** you set — this is your `SMTP_PASS`

### Recommended settings (port 465 — SSL)

```env
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=admin@zenska.ph
SMTP_PASS=your_mailbox_password_here
SMTP_FROM_NAME=Zenska CRM
SMTP_FROM_EMAIL=admin@zenska.ph
```

> **⚠ Common mistake:** `SMTP_PASS` must be your **mailbox** password — the one
> you set in hPanel for that email account. It is NOT your Hostinger login password.

### Alternative — port 587 (STARTTLS)

If port 465 doesn't work, try:

```env
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
```

Everything else stays the same.

---

## Verifying it works

When the backend starts you will see one of these in the terminal:

```
[MAIL] ✅ SMTP OK — smtp.hostinger.com:465 as <admin@zenska.ph>
```
→ Email is fully working. No further action needed.

```
[MAIL] ❌ SMTP FAILED — host=smtp.hostinger.com port=465
         → Invalid login: 535 Incorrect authentication data
         Tip: 465 = SSL/TLS | 587 = STARTTLS. Verify mailbox password is correct.
```
→ Wrong password. Double-check `SMTP_PASS` in `.env`.

```
[MAIL] ⚠  SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in your .env file.
```
→ You haven't filled in the `.env` file yet.

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
