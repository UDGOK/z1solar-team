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

# This round — 15 August 2026 (f)

Adds a Score column to the exhibitor list and a detail panel explaining what a
score means and where it came from.

**Changed:** `prisma/schema.prisma` (`riskAssessedBy` relation),
`src/components/ExhibitorsHub.tsx`,
`src/app/trade-shows/[id]/exhibitors/page.tsx`.

**Schema DID change** — `npm run db:push` is required.

> Run `db:push` every round regardless. It is additive and idempotent, and
> saying "safe to skip" once already cost a broken page.

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
git commit -m "Add score column and scoring detail panel to the exhibitor list"
git push origin main
```

`npm test` reports **145** assertions. `npm run test:db` reports **200**.

### What "Assess with AI" does

Finds every company on the show with no score yet, sends them to DeepSeek in
batches of 12, writes back a 0-100 score and a one-line note. Resumable — it
never re-scores a company already assessed, so pressing it again continues
rather than starting over. Requires `DEEPSEEK_API_KEY` in Vercel.

### Reading the Score column

| Shown | Means |
|---|---|
| `88` | Scored, checked by a person |
| `88?` | Scored by AI, nobody has verified it |
| `n/r` | Asked, model didn't recognise the company — deliberately not a zero |
| `—` | Never assessed |

Click any score for the band definitions, the note, where it came from and
when, and a box to set your own. Saving your own marks it checked and removes
the `?`.
