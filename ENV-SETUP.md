# Z1Power Team Hub — Environment Variables

Set every one of these in **Vercel → your project → Settings → Environment
Variables**, scoped to **Production** (and Preview if you use preview
deployments). Never commit them to the repo.

---

## Already set — leave alone

| Variable | Source |
|---|---|
| `DATABASE_URL` | Injected automatically by the Neon integration |
| `BLOB_READ_WRITE_TOKEN` | Injected automatically by the Vercel Blob integration |
| `NEXTAUTH_SECRET` | Any long random string. Already set. |
| `NEXTAUTH_URL` | `https://www.szhholdings.com` — no trailing slash |
| `GOOGLE_CLIENT_ID` | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console |
| `RESEND_API_KEY` | Resend dashboard |
| `CRON_SECRET` | Any random string; protects the weekly-report cron |

---

## Sentry — already connected

Injected automatically by the Vercel Sentry integration:
`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`,
`SENTRY_AUTH_TOKEN`.

Note: the app falls back to `NEXT_PUBLIC_SENTRY_DSN` when `SENTRY_DSN` is
missing, which is why server-side error capture works even though the
integration only sets the public one.

---

## NEW — Twilio SMS

Get these from **Twilio Console → Account Info** on the dashboard home page.

| Variable | Value | Where to find it |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | starts `AC...` | Console dashboard, "Account SID" |
| `TWILIO_AUTH_TOKEN` | the primary Auth Token | Console dashboard, next to Account SID |
| `TWILIO_PHONE_NUMBER` | `+19185550142` | Phone Numbers → Manage → Active numbers |
| `TWILIO_WEBHOOK_URL` | `https://www.szhholdings.com/api/sms/webhook` | must match Twilio's config EXACTLY |

### Important: use the Account SID + Auth Token, not an API Key

An API Key (`SK...` + secret) can send messages but **cannot verify inbound
webhook signatures** — that check is computed with the main Auth Token. If you
put an SK key in `TWILIO_AUTH_TOKEN`, every incoming text will be rejected as
unsigned and inbound SMS will silently stop working.

### Why TWILIO_WEBHOOK_URL must match exactly

Twilio signs the request using the full URL it called. If Twilio is configured
with a trailing slash, or `szhholdings.com` without `www`, and this variable
says something different, the signature won't match and messages get rejected.
Copy-paste the same string into both places.

### After setting the variables

1. Twilio Console → Phone Numbers → your number → **Messaging** section
2. "A message comes in" → Webhook → `https://www.szhholdings.com/api/sms/webhook` → HTTP POST
3. Save
4. **Register for A2P 10DLC** (Messaging → Regulatory Compliance). Takes 1–3
   weeks to approve. Nothing sends until it clears.

---

## NEW — DeepSeek AI (optional)

| Variable | Value |
|---|---|
| `DEEPSEEK_API_KEY` | starts `sk-`, from platform.deepseek.com → API Keys |

Optional. Without it, meeting-note extraction still works using the rule-based
engine — you just don't get the AI summary, decisions, or the extra items AI
catches.

---

## Optional

| Variable | Purpose |
|---|---|
| `RESEND_FROM` | e.g. `Z1Power <noreply@z1power.com>`. Needs a verified domain in Resend. Until then Resend only delivers to the account owner's address. |

---

## Keys to rotate

These were shared in chat and should be regenerated:

- **Twilio API Key** (the SK... one shared in chat) — Console → Account → API keys & tokens → revoke
- **DeepSeek API key** (the one shared in chat) — platform.deepseek.com → API Keys → revoke
- **Resend API key** — resend.com → API Keys
- **Google OAuth client secret** — Google Cloud Console → Credentials

Rotating is quick: create the new one, paste it into Vercel, redeploy, then
delete the old one. Do it in that order so there's no downtime.

---

## Verifying it works

| What | How |
|---|---|
| Sentry | Visit `/api/sentry-test` as admin, then check sentry.io → Issues |
| PDF generation | Visit `/api/pdf-debug` as admin — should report all stages passing |
| SMS inbound | Text your Twilio number from a team member's phone (their number must be on their Team record) |
| SMS outbound | Texts page → "Send a text" |
| AI extraction | Meetings → Import notes — a Summary section appears when the key is set |
