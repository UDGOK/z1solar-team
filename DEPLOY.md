# Deploying — Z1Power Team Hub

Updated for the zip dated **15 August 2026** (exhibitor module round 3).

Scroll to **"This round"** at the bottom for what changed and which steps you
can skip this time.

---

## Step 0 — Extract (PowerShell, not Command Prompt)

`EXTRACT-SAFELY.ps1` is a PowerShell script; `cmd` can't run it.

1. Put `EXTRACT-SAFELY.ps1` in the same folder as `z1power-cms-COMPLETE.zip`
2. Right-click it → **Run with PowerShell**
3. Wait for **`EXTRACTION CORRECT - all 12 bracket-route files match.`**

If it says anything else, **stop**. Don't build, don't push. Send the output.

> Why this matters: Windows File Explorer's "Extract All" mangles folder names
> containing square brackets — `src\app\projects\[id]\` — and silently drops
> files into the wrong directory. It has cost four separate debugging rounds on
> this project. The count above rises whenever a new `[id]` route is added, so
> use the `.ps1` from the SAME zip, not an older copy.

Then:

4. Copy `.git` and `.env` from your existing `z1solar-team` into the extracted
   `z1power-cms` folder
5. Rename it to `z1solar-team`, replacing the old folder
6. Check `package.json` sits **directly** inside `z1solar-team`, not nested one
   level down. A nested copy makes git treat it as a submodule and your commits
   will silently contain nothing.

---

## Steps 1–8 — Command Prompt

```
cd /d "C:\Users\Yasir\Downloads\github clone z1\z1solar-team"

npm install

npm test

npm run build

npm run db:push

npm run db:seed

git status

git add -A
git commit -m "<describe what changed>"
git push origin main
```

---

## What each step should print

| Step | Expect | If it doesn't |
|---|---|---|
| `npm install` | `added N packages` | — |
| `npm test` | `113 assertions passed, 0 failed`, with `- skipped (destructive)` on the e2e line | Any failure: stop, send the output. Don't deploy a red build. |
| `npm run build` | `✓ Compiled successfully` | — |
| | `/projects/[id]` at roughly **11 kB / 280 kB** | Anything near **320 B** means corrupted extraction. Re-extract. |
| `npm run db:push` | `Your database is now in sync` | If Prisma warns about **data loss**, answer **no** and ask first. |
| `npm run db:seed` | `Team already has N member(s) — leaving it alone` | If it says it's seeding team members on a database that already has people, stop. |
| `git status` | `.env` **not** listed; no mention of a submodule or `z1power-cms/` | Either means the folders are nested wrong. |

---

## Order matters

**`db:push` before `git push`.** Pushing to `main` triggers a Vercel deploy. If
new code lands before the tables exist, every page touching the new models
errors until the schema catches up.

---

## Optional — the full test suite

```
npm run test:db
```

Runs all **140** assertions, including the destructive end-to-end import tests,
against a throwaway SQLite database it builds and deletes itself. It cannot
reach Neon: the generated test schema hard-codes the database path instead of
reading `DATABASE_URL`.

Plain `npm test` skips those, which is why it reports 113 rather than 140.

---

## After changing files yourself

If you add, delete or edit any file inside a `[bracket]` folder, regenerate the
extraction manifest or the verifier will report a false failure next time:

```
node scripts/make-manifest.js
```

---

# This round — 15 August 2026 (g)

Timezone correctness. **This fixes a real display bug, not a preference.**

**Changed:** new `src/lib/time.ts`, new `tests/time.test.ts`,
`src/components/TradeShowCard.tsx`, `src/components/TradeShowsHub.tsx`,
`src/components/ExhibitorsHub.tsx`, `src/components/ActivityFeed.tsx`,
`src/components/AuditPanel.tsx`, `src/components/TodoThread.tsx`,
`src/components/MeetingCard.tsx`,
`src/app/trade-shows/[id]/exhibitors/page.tsx`,
`src/app/api/trade-shows/[id]/target-list/route.ts`,
plus the score column from round (f).

**Schema changed in round (f)** — run `db:push`.

### Full sequence

```
cd /d "C:\\Users\\Yasir\\Downloads\\github clone z1\\z1solar-team"
npm install
npm test
npm run build
npm run db:push
npm run db:seed
git status
git add -A
git commit -m "Render all dates and times in Central; fix calendar dates shifting a day in non-UTC timezones"
git push origin main
```

`npm test` reports **230** assertions. `npm run test:db` also reports 230 plus
the database suites.

### What was wrong

`<input type="date">` gives `2026-09-01`, which stores as UTC midnight. It was
then formatted with no timezone, so it rendered in **the viewer's browser
timezone**. In Central that is 7pm on Aug 31 — so a show entered as Sep 1–3
displayed as **"Aug 31 – Sep 2"**, and the countdown was a day out.

### The rule, if you or anyone else adds a date later

Two kinds of value, and mixing them up is silent:

- **Calendar dates** (from a date picker — show dates, deadlines, due dates)
  → `formatDate()` / `formatDateRange()`. Read in UTC.
- **Instants** (createdAt, meeting times, texts, last seen)
  → `formatDateTime()` / `formatTime()` / `formatInstantDate()`. Read in Central,
  labelled `CT`.

Never call `toLocaleDateString` directly. `src/lib/time.ts` has the full
explanation at the top.

### Still to sweep — 25 sites

Not yet converted, in lower-traffic surfaces: `src/lib/actions.ts`,
`src/lib/weeklyReport.ts`, `src/lib/email.ts`, `src/lib/ai/assistant.ts`,
`src/lib/purchases.ts`, `src/lib/presence.ts`,
`src/components/PurchasesHub.tsx`, `src/components/MeetingImportPanel.tsx`,
and the two PDF documents. These render in server time (UTC on Vercel) today,
so they are consistent but an hour-shifted in places, not day-shifted. Worth
finishing, not urgent.
