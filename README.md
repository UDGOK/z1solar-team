# Z1Power Team Hub

Internal CMS for the Z1Power weekly ops meeting — projects, team roster, key
dates, to-dos, open questions, and budget/financial projections, all behind a
single shared team password.

Built with Next.js 14 (App Router), TypeScript, Tailwind CSS, and Prisma +
Postgres.

## What's in here

- **Login** — one shared password for the whole team (`/login`)
- **Dashboard** — budget KPIs + all projects grouped by category
- **Projects** — full CRUD: title, category, lead, team roster (name / title
  / role / tasks assigned), talking points, key dates, to-do checklist, open
  questions, and budget/quarterly projections
- **Team Directory** — name, title, email, phone for everyone, plus the
  team WhatsApp group link
- **Settings** — change the shared password, update the WhatsApp link

Pre-seeded with your current 9 team members and all 16 projects (including
the full Data Center Mead scope) so it launches ready to use.

---

## 1. Local setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` — a Postgres connection string. Easiest free option for
  testing: [neon.tech](https://neon.tech) (free tier, instant).
- `SESSION_SECRET` — any long random string. Generate one with
  `openssl rand -hex 32`.
- `TEAM_PASSWORD` — the password used the *first* time the app creates its
  settings row. Change it from the Settings page after your first login —
  after that this variable is no longer read.

Push the schema and seed the database:

```bash
npm run db:push
npm run db:seed
```

Run it:

```bash
npm run dev
```

Visit `http://localhost:3000`, log in with `TEAM_PASSWORD` (default
`z1power2026` if you didn't set one), and change the password from
**Settings**.

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
2. **Add a Postgres database:** in the project → **Storage** tab → **Create
   Database** → Postgres (this is Neon under the hood, native Vercel
   integration). Vercel automatically adds `DATABASE_URL` to your project's
   environment variables — you don't need to copy/paste it.
3. **Add the other environment variables** (Project → Settings →
   Environment Variables):
   - `SESSION_SECRET` — a long random string (`openssl rand -hex 32`)
   - `TEAM_PASSWORD` — the password to seed on first run (optional if you
     seed manually, see below)
4. **Deploy.** Vercel runs `prisma generate && next build` automatically
   (that's the `build` script in `package.json`).
5. **Push the schema to the production database.** From your local machine,
   point `DATABASE_URL` at the same Postgres instance Vercel just created
   (copy it from Vercel → Storage → your DB → `.env.local` tab), then run:
   ```bash
   npm run db:push
   npm run db:seed
   ```
   This creates the tables and loads the starting team/projects. You only
   need to do this once.
6. Visit your `*.vercel.app` URL, log in, and go change the password in
   **Settings**.

Every push to `main` auto-deploys. To add a database column or model later,
edit `prisma/schema.prisma` and re-run `npm run db:push` against production.

---

## 4. Notes

- **Auth** is a single shared password (bcrypt-hashed, stored in the
  database) behind an HTTP-only signed session cookie — intentionally
  simple for a small internal team, not built for public-facing use.
- **"New Project" category** exists so anyone can add a project that
  doesn't fit the existing three categories without touching code.
- Want individual logins instead of one shared password down the line? The
  `TeamMember` model already exists — adding per-person accounts is a
  matter of adding a password field there and swapping the login form;
  ask and I can build that next.
