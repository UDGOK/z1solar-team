/**
 * Runs the full test suite, including the destructive end-to-end import tests,
 * against a throwaway SQLite database.
 *
 *   npm run test:db
 *
 * WHY THIS SCRIPT EXISTS
 * The end-to-end suite deletes rows. .env points DATABASE_URL at production
 * Neon, and an earlier guard ("can we reach a database?") was satisfied by
 * production. That is exactly the wrong shape of check.
 *
 * The protection here is structural rather than procedural: the generated test
 * schema hard-codes `url = "file:./test.db"` instead of `env("DATABASE_URL")`.
 * Prisma therefore never reads DATABASE_URL for this run at all, so no
 * environment variable — set by you, by .env, or by CI — can aim these tests
 * at a real database. It is not possible to misconfigure.
 *
 * Cross-platform: works in PowerShell, cmd and bash. No `VAR=value cmd` syntax,
 * which PowerShell does not understand.
 *
 * The real schema is never modified. A separate prisma/schema.test.prisma is
 * written, used, and deleted — and the Prisma client is regenerated from the
 * real PostgreSQL schema on the way out, whether the tests pass, fail, or the
 * run is interrupted.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REAL_SCHEMA = path.join(ROOT, "prisma", "schema.prisma");
const TEST_SCHEMA = path.join(ROOT, "prisma", "schema.test.prisma");
const TEST_DB = path.join(ROOT, "prisma", "test.db");

function run(cmd, args, extraEnv) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true, // needed for npx on Windows
    env: { ...process.env, ...(extraEnv || {}) },
  });
  return r.status === 0;
}

function cleanup() {
  for (const f of [TEST_SCHEMA, TEST_DB, TEST_DB + "-journal"]) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {
      /* best effort — a leftover test.db is harmless, it's gitignored */
    }
  }
}

let restored = false;
function restoreClient() {
  if (restored) return;
  restored = true;
  // Regenerate against the REAL schema so the working tree is left exactly as
  // it was found. Without this, the next `npm run dev` would be talking to a
  // SQLite client while pointed at Postgres.
  console.log("\nRestoring the PostgreSQL Prisma client...");
  run("npx", ["prisma", "generate", "--schema", "prisma/schema.prisma"]);
}

// Restore even on Ctrl-C, which is when a half-swapped client is most likely
// to be left behind and most confusing to debug later.
process.on("SIGINT", () => {
  cleanup();
  restoreClient();
  process.exit(130);
});

function main() {
  const real = fs.readFileSync(REAL_SCHEMA, "utf8");

  if (!/provider\s*=\s*"postgresql"/.test(real)) {
    console.error(
      "\nprisma/schema.prisma is not set to postgresql.\n" +
        "Something has already swapped it — fix that before running tests.\n"
    );
    process.exit(1);
  }

  // Hard-coded url, deliberately NOT env("DATABASE_URL"). This is the guarantee.
  const testSchema = real
    .replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"')
    .replace(/url\s*=\s*env\("DATABASE_URL"\)/, 'url      = "file:./test.db"');

  if (testSchema === real) {
    console.error("\nCould not rewrite the datasource block. Aborting rather than guessing.\n");
    process.exit(1);
  }

  cleanup();
  fs.writeFileSync(TEST_SCHEMA, testSchema);
  console.log("Building a throwaway SQLite database...\n");

  let code = 1;
  try {
    if (!run("npx", ["prisma", "generate", "--schema", "prisma/schema.test.prisma"])) {
      console.error("\nprisma generate failed.");
      return 1;
    }
    if (
      !run("npx", [
        "prisma",
        "db",
        "push",
        "--schema",
        "prisma/schema.test.prisma",
        "--skip-generate",
      ])
    ) {
      console.error("\nprisma db push failed.");
      return 1;
    }

    const ok = run("npx", ["tsx", "tests/run.ts"], {
      Z1_E2E: "1",
      DATABASE_URL: "file:./prisma/test.db",
    });
    code = ok ? 0 : 1;
  } finally {
    cleanup();
    restoreClient();
  }
  return code;
}

process.exit(main());
