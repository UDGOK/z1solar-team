# Z1Power Team Hub — Project State

**Last updated:** 15 August 2026
**Purpose:** Hand this to a new session so work can continue without re-explaining anything.

---

## 1. What this is

An internal operations platform for **Z1Power / SZH Holdings**, a solar, battery storage and
data centre developer. It replaced spreadsheets and scattered chat for a 9-person team.

- **Live:** https://www.szhholdings.com
- **Repo:** github.com/UDGOK/z1solar-team (branch `main`)
- **Local path:** `C:\Users\Yasir\Downloads\github clone z1\z1solar-team`
- **Hosting:** Vercel · **Database:** Neon Postgres · **Files:** Vercel Blob (private)

### The team

| Name | Role | Notes |
|---|---|---|
| Yasir Jahangir | Lead Architect, ADMIN | Primary user. yasir@futonix.com |
| Mohammad Siddiki | Team Lead, ADMIN | muzz.siddiki@gmail.com |
| Syed Hussain | CEO | Also referred to as **Zakir** |
| Shahab Kazmi | — | Also **Shahab Bhai** |
| Javed Iqbal Ph.D | Sustainability & BD | Stored as **Javaid**; also **Javed** |
| Ali Askari | Graphics / Web | |
| Ken | Legal | |
| Daniel | — | |
| Ryan | — | |

**Name aliases matter** — meeting notes use different spellings. Handled in
`src/lib/meetingExtract.ts` → `NAME_ALIASES`: zakir→syed, javed→javaid, muhammad/mohamed→mohammad,
yasser→yasir, "shahab bhai"→shahab.

---

## 2. Tech stack

- Next.js 15.5.21 (App Router) · React 19 · TypeScript
- Prisma 5.22 → Neon Postgres (**44 models**)
- NextAuth (Google OAuth + credentials)
- Tailwind, custom brand tokens
- Sentry (errors) · Resend (email) · Twilio (SMS) · DeepSeek (AI)
- `@react-pdf/renderer` for PDF generation

**Do not upgrade Prisma to 7.x** — it prompts on every build. 5.22 is fine and the upgrade is
a two-major-version migration for no benefit.

---

## 3. Working agreements with Yasir

These were established over many sessions. Following them avoids repeated friction.

1. **Deliver a complete project zip every round**, not patches. Yasir extracts fresh each time.
2. **Verify before claiming done.** Build, typecheck, run against a real database, check the
   rendered output, test the failure cases. He has explicitly asked for rigour.
3. **He asks for "an army of agents."** Be straight: you are a single agent running a
   disciplined verification sequence. Don't play along with the framing.
4. **Never put secrets in files or chat.** He has pasted live API keys several times. Tell him
   to rotate, and direct credentials into Vercel env vars instead.
5. **Match the existing design language** — Montserrat headings, Poppins body, Z1Power green
   `#4CAB3E`, dashed-border cards. Don't redesign.
6. **He reviews mockups before building** for anything visual.
7. **Explain reasoning, especially when disagreeing.** He has changed direction based on a
   well-argued case more than once (task dependencies, time tracking, provider switching).

---

## 4. THE DEPLOYMENT TRAP (read this before shipping anything)

Windows File Explorer's **"Extract All" corrupts bracket folders** — `src\app\projects\[id]\`.
It drops `[id]\financials\page.tsx` into the parent, overwriting the real project page.
**This has happened four times** and each time cost a debugging round chasing a phantom bug.

### The safe sequence

```
1. Run EXTRACT-SAFELY.ps1  (PowerShell, in the same folder as the zip)
   → must print "EXTRACTION CORRECT" with 338 / 63
2. Copy .git and .env from the old folder into the extracted one
3. Rename to z1solar-team, replacing the old folder
   ⚠ package.json must sit DIRECTLY inside z1solar-team, not nested
4. npm install
5. npm run build
6. verify-files.bat   → expects 338 / 63
7. npm run db:push && npm run db:seed   (when schema changed)
8. git add -A && git commit -m "..." && git push origin main
```

### Line-count gate

`verify-files.bat` and `EXTRACT-SAFELY.ps1` both check:
- `src/app/projects/[id]/page.tsx` → **338 lines**
- `src/app/projects/[id]/financials/page.tsx` → **63 lines**

**Update BOTH scripts whenever these files change**, or they report false failures. This has
already caught real corruption and also produced one false alarm from being stale.

### Route-size sanity check

After `npm run build`, `/projects/[id]` should read around **11 kB / 281 kB First Load**.
If any route shows ~320 B, extraction was corrupted — do not push.

### Git gotcha

A previous session ended up with the project nested inside itself, and git treated it as a
submodule so nothing committed. If `git status` mentions a submodule or `z1power-cms/`, the
folders are nested wrong.

---

## 5. Environment variables

All set in **Vercel → Settings → Environment Variables**, scoped to Production.
**Never put values in files or chat.**

| Variable | Purpose | Status |
|---|---|---|
| `DATABASE_URL` | Neon Postgres | Auto-injected |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (private store) | Auto-injected |
| `NEXTAUTH_SECRET` | Session signing | Set |
| `NEXTAUTH_URL` | `https://www.szhholdings.com` | Set |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google sign-in | Set — **rotate, was in chat** |
| `RESEND_API_KEY` | Email | Set — **rotate, was in chat** |
| `RESEND_FROM` | Sender identity | Optional, needs verified domain |
| `CRON_SECRET` | Protects weekly-report cron | Set |
| `SENTRY_DSN` | Server errors | See note below |
| `NEXT_PUBLIC_SENTRY_DSN` | Client errors | Set by integration |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Source maps | Set by integration |
| `DEEPSEEK_API_KEY` | AI extraction + assistant | Set — **rotate, was in chat** |
| `TWILIO_ACCOUNT_SID` | Starts `AC` | Set |
| `TWILIO_AUTH_TOKEN` | Master auth token | Set — **rotate, was in chat** |
| `TWILIO_PHONE_NUMBER` | E.164 format | Pending — see §7 |
| `TWILIO_WEBHOOK_URL` | `https://www.szhholdings.com/api/sms/webhook` | Must match Twilio exactly |

### Critical notes

- **`SENTRY_DSN` is not actually set** — Vercel's integration only provides the public one.
  The code falls back to `NEXT_PUBLIC_SENTRY_DSN`. Don't "fix" this by removing the fallback.
- **Twilio needs the Account SID + Auth Token, NOT an API Key (`SK...`).** SK keys cannot
  verify inbound webhook signatures. Yasir was given an SK key first; this was caught before
  it caused a silent failure.
- **`TWILIO_WEBHOOK_URL` must match Twilio's console character-for-character** — the signature
  is computed over the exact URL. A trailing slash or missing `www` breaks it silently.
- **Secrets shared in chat that still need rotating:** Twilio Auth Token, Twilio API Key,
  Twilio OAuth client secret, DeepSeek key, Resend key, Google OAuth secret.

---

## 6. What's built

**21 pages · 13 API routes · 44 models · 58 components**

### Core
Dashboard (KPIs, portfolio rollup, activity feed, category-grouped projects with dormant ones
collapsed) · Projects (list + detail + inline rename/priority, archive) · Tasks (mine/assigned/
everyone/workload) · Messages · Team · Trade shows · Settings

### Meetings → tasks
Schedule with agenda/attendees/join link · agenda ticked live · notes separate from agenda ·
"notes missing" flag · **import notes or transcript → review → create tasks**. Rule-based
extraction (`meetingExtract.ts`) plus DeepSeek enhancement (`ai/deepseek.ts`). Human review is
mandatory — nothing is created without confirmation.

Two-stage task completion: assignee marks done → project lead confirms or reopens with a reason
→ threaded discussion (`TodoThread.tsx`).

### Purchases
Tiered approval ($500 lead / $25k approver / above that admin / over $25k needs a second
different signature). **Self-approval blocked for everyone including admins.** Budget impact
shown at approval. Approved purchases auto-post a committed line item to the project ledger;
invoicing moves committed → actual; cancelling releases it.

### SMS (built, awaiting carrier registration)
Signature-verified webhook · approved-number allowlist (team phones auto-synced) · layered
routing: project code → 8-hour session → numbered reply → unfiled inbox · MMS to private blob ·
`TASKS` / `DONE` / `STOP` / `HELP` commands · delivery status callback · 500/day send cap.

### AI assistant
`/assistant` — DeepSeek chat with **permission-scoped context**. Verified: an admin's context
includes budget/committed/spent; a member without financial access gets the same project line
with those fields absent entirely. The model cannot leak what it never receives.

### Infrastructure
Audit log (append-only, field-level diffs, financial flag) · financial reconciliation
(committed vs line items, detect then optionally repair) · backup restore (dry-run preview,
additive-only, never overwrites) · login rate limiting (5/account, 20/IP, 15 min).

### Resources & categories
Resource library (files + links, 5 seeded categories) · project category CRUD with atomic
rename and reassign-before-delete.

---

## 7. Blocked / in progress

### Twilio SMS — waiting on carrier registration
**Everything is built and tested.** The blocker is **A2P 10DLC registration**, which is a US
*carrier* requirement (Verizon/AT&T/T-Mobile), not a Twilio one. Switching providers does not
avoid it — this was researched and explained.

Symptom seen: 15 messages sent, all accepted by Twilio, none delivered. That's the classic
unregistered-10DLC signature.

**Recommended faster path (not yet actioned):** buy a **toll-free** number instead. Separate
verification track, typically 2–3 days vs 7–10, free, and **no code changes** — just swap
`TWILIO_PHONE_NUMBER`.

Also note: an earlier number purchase failed in Twilio ("Purchase failed") — likely a trial
account or billing issue. Confirm a number actually exists.

### Not yet done
- Purchases don't appear in the project PDF (Yasir mentioned wanting printable records)
- No permanent test suite in the repo — all tests written this project were throwaway scripts
- `src/lib/actions.ts` is very large (every server action in one file)
- No staging environment
- Sub-task-derived progress % (suggested; recommendation was to show derived *alongside*
  manual, not replace it)

### Deliberately advised against
- **Task dependencies** — 20 of 23 projects sit at 0%; nothing to sequence yet
- **Time tracking** — start/stop timers won't be maintained on job sites
- **Switching SMS provider** — same carrier requirement everywhere

---

## 8. Bugs fixed (don't reintroduce these)

| Bug | Root cause |
|---|---|
| PDF downloaded as `.txt` | Next 15 bundles React 19 canary; react-pdf loaded React 18. Fixed by upgrading React + `serverExternalPackages` + webpack alias in `next.config.js`. **Don't remove those.** |
| Sentry silently dead | `instrumentation.ts` was in project root; Next requires it in `src/` when `src/` exists. Zero instrumentation files were in the build. |
| Sentry events never arriving | No `flush()` — serverless freezes before the async send completes. |
| Role saves failing | Client sent Prisma metadata (`_count`) into a write. Fixed with a server-side field whitelist — **any new role capability must be added to schema, `permissions.ts`, `RoleManager.tsx`, the `RoleInput` type AND the `saveRole` whitelist**, or it silently won't save. |
| Meeting extraction returned 0 items | Tests used my own note format. Real notes use `### @Name` headings with `- [ ]` items — the assignee is in the heading, not the line. |
| Duplicate action items | Rule item "Muhammad - confirm…" vs AI "Confirm…" not deduped due to 50-char truncation. Fixed with name-prefix stripping + word-overlap similarity. |
| PDF layout collapsed | Stray `flex: 1` on a `Text` inside an already-flexed `View`. Caught by rendering the PDF to an image and looking at it. |
| Seed crash on re-run | Bootstrapped admins by *name*; Yasir renamed himself to "Yasir Jahangir", so it tried to give a different record an email already in use. Now matches on email first. |
| Prisma schema errors | Prisma does **not** support `/** */` comments, and SQLite doesn't support `autoincrement()` on non-id fields (Postgres does — PR numbers are assigned in the action instead so both behave identically). |

---

## 9. Testing approach

Local testing uses SQLite. The pattern:

```bash
cp prisma/schema.prisma /tmp/pg.bak
sed -i 's/provider = "postgresql"/provider = "sqlite"/; s#url      = env("DATABASE_URL")#url      = "file:./dev.db"#' prisma/schema.prisma
# also set DATABASE_URL="file:./dev.db" in .env
rm -f dev.db prisma/dev.db && npx prisma generate && npx prisma db push --skip-generate && npm run db:seed
# ... run tests ...
cp /tmp/pg.bak prisma/schema.prisma   # ALWAYS restore before packaging
```

**Always verify the schema says `postgresql` before zipping.** This has been missed twice and
shipped a SQLite schema.

Test scripts are throwaway and deleted after running — check for stray `t.ts` before packaging.

---

## 10. Suggested next steps

1. **Toll-free Twilio number** — fastest route to working SMS
2. **Purchases in the project PDF** — Yasir asked for printable records
3. **Commit a real test suite** — ~250 assertions were written and discarded across this project
4. **Split `actions.ts`** by domain
5. **Staging environment** — a `staging` branch against a database copy

---

## 11. Deliverables produced

| File | Purpose |
|---|---|
| `z1power-cms-COMPLETE.zip` | Full project source |
| `EXTRACT-SAFELY.ps1` | Safe Windows extraction + self-verification |
| `verify-files.bat` | Line-count gate (338 / 63) |
| `ENV-SETUP.md` | Environment variable guide |
| `Z1Power-Team-Hub-Handbook.pdf` | 13-page user handbook for the team |
| `PROJECT-STATE.md` | This document |
