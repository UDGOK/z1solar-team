# Z1Power Team Hub

Internal CMS for the Z1Power weekly ops meeting — projects, team roster, key
dates, to-dos, open questions, budget/financial projections, and per-person
access control, with everyone signing in via their own Google account.

Built with Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma +
Postgres, and NextAuth (Google OAuth).

## What's in here

- **Login** — Google Sign-In only. No passwords to manage. Only emails that
  exist in Team Directory can sign in at all.
- **Dashboard** — status highlights (not dollar figures) + all projects
  grouped by category, filtered to what each person is allowed to see.
- **Projects** — full CRUD: title, category, lead, team roster (name / title
  / role / tasks assigned), talking points, key dates, to-do checklist, open
  questions, status + completion %, file/image attachments, and
  budget/quarterly projections.
- **PDF Summaries** — one-click branded PDF export per project (logo,
  completion ring, team, financials) with a shareable public link
  (Email / WhatsApp / LinkedIn / native share).
- **Team Directory** — name, title, email, phone for everyone (admin-only to
  edit), plus the team WhatsApp group link and weekly meeting link.
- **Roles & per-project access control** — see section 5 below. This is the
  core of how visibility works, worth reading before you invite the team.
- **Settings** — update WhatsApp/meeting links, manage who's an admin.

Pre-seeded with your 9 team members and all 16 projects (including the full
Data Center Mead scope) so it launches ready to use.

---

## 1. Local setup

```bash
npm install
cp .env.example .env
```

Edit `.env` — see section 4 below for exactly how to get the Google values.
At minimum you need:
- `DATABASE_URL` — a Postgres connection string (e.g. [neon.tech](https://neon.tech), free tier).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from Google Cloud Console.
- `NEXTAUTH_SECRET` — any long random string (`openssl rand -hex 32`).
- `NEXTAUTH_URL` — `http://localhost:3000` for local dev.

Push the schema and seed the database:

```bash
npm run db:push
npm run db:seed
```

The seed script prints which two people got promoted to admin and what
email each one signs in with — that's set in `prisma/seed.ts` under
`ADMIN_ACCOUNTS`, currently `yasir@futonix.com` and `muzz.siddiki@gmail.com`.

Run it:

```bash
npm run dev
```

Visit `http://localhost:3000` and sign in with Google using one of those
two emails.

---

## 2. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit — Z1Power Team Hub"
git branch -M main
git remote add origin https://github.com/<your-org>/z1power-team-hub.git
git push -u origin main
```

---

## 3. Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo.
2. **Add a Postgres database:** Storage tab → Create Database → Postgres
   (marketplace option is Neon — free tier is fine). Auto-adds `DATABASE_URL`.
3. **Add Blob storage (for file/image uploads):** Storage tab → Create
   Database → Blob. Auto-adds `BLOB_READ_WRITE_TOKEN`.
4. **Add the remaining environment variables** (Settings → Environment
   Variables): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`,
   and `NEXTAUTH_URL` set to your real deployed URL (e.g.
   `https://www.szhholdings.com` — no trailing slash).
5. **Deploy.**
6. **Push the schema to production.** From your local machine, point
   `DATABASE_URL` at the same Postgres instance Vercel just created (copy it
   from Vercel → Storage → your DB → `.env.local` tab), then run
   `npm run db:push` and `npm run db:seed` once.
7. Go back to Google Cloud Console and add your production callback URL
   (see section 4, step 5) — this is easy to forget and login will fail
   without it.

Every push to `main` auto-deploys.

---

## 4. Setting up Google Sign-In (one-time, ~10 minutes)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   create a new project (or use an existing one) — name it anything, e.g.
   "Z1Power Team Hub".
2. Left sidebar → **APIs & Services → OAuth consent screen**.
   - User type: **External** (unless your team is on Google Workspace with a
     shared company domain, in which case **Internal** is simpler and skips
     the "unverified app" warning entirely).
   - Fill in app name, your email, and save through the steps.
   - Under **Test users** (External only), add every team member's Google
     email — while the app is unverified, only listed test users can sign
     in. This list should match Team Directory.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized redirect URIs**, add both:
     - `http://localhost:3000/api/auth/callback/google` (local dev)
     - `https://www.szhholdings.com/api/auth/callback/google` (production —
       swap in your real domain)
4. Click Create. Copy the **Client ID** and **Client Secret** — these are
   your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. If you add a new domain later (custom domain change, staging URL, etc.),
   come back here and add its `/api/auth/callback/google` URL too, or
   sign-in will fail on that domain with a `redirect_uri_mismatch` error.

**Important:** Google auth only verifies *identity* — whether someone is
actually who their Google account says they are. It does **not** control
who's allowed into this app. That's entirely driven by Team Directory: if a
person's email isn't in Team Directory, `next-auth`'s sign-in callback
rejects them outright, no matter how valid their Google login is.

---

## 5. Roles & Per-Project Access Control

Every team member signs in with their own Google account — no shared
password anymore. What they can see is layered:

**Base roles** (`TeamMember.role`, admin-controlled from Settings → Manage
Admins):
- **Member** (default) — can view and edit every project's talking points,
  key dates, to-dos, open questions, team roster, and status/completion.
  Cannot see financials, cannot create or delete projects.
- **Admin** — sees everything, can create/delete projects, manage the team
  directory, and promote/revoke other admins.

**Per-project overrides** (on each project's page, admins see an "Access
Control" table): for any specific person, on any specific project, an admin
can toggle:
- **Hide Project** — that person won't see this project at all, anywhere in
  the app (dashboard, project list, direct link — all return a 404).
- **Show Financials** — grants that person financial visibility on *this
  project only*, without making them a full admin.

This is deliberately an override system, not an allow-list: by default
every member sees every project (minus financials), and admins carve out
exceptions from there — hiding a specific sensitive project from specific
people, or opening up financials on one project to someone who needs it,
without a blanket promotion to admin.

All of this is enforced **server-side** — the checks live in the server
actions and API routes themselves (`src/lib/permissions.ts`), not just in
what the UI chooses to render. A modified request from a restricted session
can't write to financial fields or pull a hidden project's data.

**Onboarding a new person:** add them in Team Directory with their real
Google email (admin-only). That's it — they can now sign in. Nothing else
happens automatically; they start as a Member with the default visibility
rules above until an admin changes anything for them.

---

## 6. Notes

- **"New Project" category** exists so anyone can add a project that
  doesn't fit the existing three categories without touching code.
- The bootstrap admin list lives in `prisma/seed.ts` (`ADMIN_ACCOUNTS`) —
  it's only used the first time `db:seed` runs for a given person; after
  that, admin status is fully controlled from Settings → Manage Admins.
- Removing someone's email from Team Directory effectively revokes their
  access entirely — they won't pass the sign-in allowlist check anymore.
