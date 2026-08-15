/**
 * End-to-end import test against a real database.
 *
 * Runs the ACTUAL functions the server actions call — stageImportCore and
 * applyImportCore — over the real published Datacloud USA 2026 company list.
 * Only the permission wrapper is skipped, because that needs a NextAuth
 * session; everything below it is the shipping code path.
 *
 * SAFETY — read before changing the guard below.
 *
 * This suite DELETES ROWS. It must never be able to reach a real database.
 * An earlier version guarded with `SELECT 1`, which only proves that *some*
 * database is reachable — and since .env points DATABASE_URL at production
 * Neon, that guard let the suite connect to production and begin issuing
 * deleteMany() calls. It stopped only because the tables didn't exist yet.
 *
 * The guard is now positive rather than negative: this suite refuses to run
 * unless BOTH
 *   1. Z1_E2E=1 is set, and
 *   2. DATABASE_URL is a local SQLite file (starts with "file:")
 * are true. `npm test` therefore skips it, and only `npm run test:db` — which
 * builds a throwaway SQLite database and tears it down afterwards — runs it.
 *
 * Do not relax this to "the URL contains the word test". Production URLs have
 * contained the word test before.
 */
import path from "path";
import fs from "fs";
import { ok, suite } from "./_harness";
import { parseDelimited } from "../src/lib/importers/csv";
import { guessColumnMap, applyColumnMap } from "../src/lib/importers/columnMap";
import { stageImportCore, applyImportCore } from "../src/lib/exhibitors/importCore";

const FIXTURE = path.join(__dirname, "fixtures", "datacloud-usa-2026-companies.csv");

export default async function run() {
  return suite("import end-to-end (real database)", async () => {
    // ---- SAFETY GATE — see the note at the top of this file ----
    const url = process.env.DATABASE_URL ?? "";
    const optedIn = process.env.Z1_E2E === "1";
    const isThrowawayFile = url.startsWith("file:");

    if (!optedIn || !isThrowawayFile) {
      // Printed, not just counted. A destructive suite that silently does
      // nothing is its own hazard — you'd read "all passed" and believe the
      // import pipeline had been exercised when it hadn't.
      if (optedIn) {
        console.log(
          "        ! REFUSED to run: Z1_E2E=1 was set, but DATABASE_URL is not a\n" +
            "          local SQLite file. These tests delete rows and will never\n" +
            "          touch a remote database. Use: npm run test:db"
        );
      } else {
        console.log("        - skipped (destructive). Run `npm run test:db` to include it.");
      }
      ok(true, "end-to-end suite correctly did not run against a non-throwaway database");
      return;
    }

    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient();

    // Belt and braces: ask the client itself what it connected to. If the
    // generated client is the Postgres one, the schema wasn't swapped and this
    // must not proceed even though the URL looked like a file.
    try {
      await db.$queryRaw`SELECT 1`;
    } catch (e: any) {
      ok(false, "could not open the throwaway database", e?.message ?? String(e));
      await db.$disconnect().catch(() => {});
      return;
    }

    const actor = { id: "", name: "Test Runner" };

    try {
      // ---- clean slate ----
      await db.exhibitorImportItem.deleteMany({});
      await db.exhibitorImport.deleteMany({});
      await db.tradeShowExhibitorProject.deleteMany({});
      await db.exhibitorNote.deleteMany({});
      await db.tradeShowExhibitor.deleteMany({});
      await db.vendorTagLink.deleteMany({});
      await db.vendorContact.deleteMany({});
      await db.vendor.deleteMany({});

      const member = await db.teamMember.upsert({
        where: { email: "importtest@z1power.test" },
        update: {},
        create: { name: "Test Runner", email: "importtest@z1power.test", role: "ADMIN" },
      });
      actor.id = member.id;

      const show = await db.tradeShow.create({
        data: {
          name: "Datacloud USA 2026 (test)",
          startDate: new Date("2026-09-02"),
          endDate: new Date("2026-09-03"),
          city: "Austin",
          state: "TX",
        },
      });

      // ---- parse the real file ----
      const grid = parseDelimited(fs.readFileSync(FIXTURE, "utf8"));
      const map = guessColumnMap(grid[0]);
      const rows = applyColumnMap(grid.slice(1), map, 2);
      ok(rows.length === 143, "143 rows parsed from the real file", `got ${rows.length}`);

      // ---- stage ----
      const importId = await stageImportCore(db, show.id, actor, {
        source: "FILE_CSV",
        fileName: "datacloud-usa-2026-companies.csv",
        columnMap: map,
        rows,
      });

      const staged = await db.exhibitorImportItem.findMany({
        where: { importId },
        orderBy: { sortOrder: "asc" },
      });
      ok(staged.length === 143, "143 rows staged", `got ${staged.length}`);

      // Nothing may exist yet — staging must not touch the real tables.
      ok((await db.vendor.count()) === 0, "staging created no vendors");
      ok((await db.tradeShowExhibitor.count()) === 0, "staging created no exhibitors");

      // The real duplicate Datacloud published, caught and unticked.
      const dupes = staged.filter((s) => !s.accepted);
      ok(dupes.length === 1, "exactly one row unticked (the published duplicate)", `got ${dupes.length}`);
      ok(
        dupes[0].companyName.toLowerCase().includes("pure plastics"),
        "…and it is Pure Plastics & Metals",
        dupes[0].companyName
      );
      ok(
        (dupes[0].reason || "").includes("Same company as row"),
        "…with a reason a human can act on",
        String(dupes[0].reason)
      );

      const sponsors = staged.filter((s) => s.listing === "Sponsor");
      ok(sponsors.length === 83, "83 rows classified as sponsors", `got ${sponsors.length}`);
      ok(
        staged.find((s) => s.companyName === "Sungrow")?.listing === "Exhibitor",
        "SUNGROW tidied to 'Sungrow' and kept as exhibitor",
        String(staged.find((s) => /sungrow/i.test(s.companyName))?.companyName)
      );

      // ---- apply ----
      const result = await applyImportCore(db, importId, actor);
      ok(result.exhibitorsCreated === 142, "142 exhibitors created (duplicate skipped)", JSON.stringify(result));
      ok(result.vendorsCreated === 142, "142 vendors created", String(result.vendorsCreated));
      ok(result.skipped === 1, "1 row skipped", String(result.skipped));
      ok((await db.vendor.count()) === 142, "142 vendors in the database");

      const imp = await db.exhibitorImport.findUnique({ where: { id: importId } });
      ok(imp?.status === "APPLIED", "import marked applied");

      // ---- re-import the SAME file: must update, never duplicate ----
      const importId2 = await stageImportCore(db, show.id, actor, {
        source: "FILE_CSV",
        fileName: "same-file-again.csv",
        columnMap: map,
        rows,
      });
      const staged2 = await db.exhibitorImportItem.findMany({ where: { importId: importId2 } });
      const matched = staged2.filter((s) => s.matchedVendorId);
      ok(matched.length >= 140, "re-import recognises the vendors it just created", `${matched.length}/143`);

      const result2 = await applyImportCore(db, importId2, actor);
      ok(result2.vendorsCreated === 0, "re-import creates no new vendors", JSON.stringify(result2));
      ok(result2.exhibitorsCreated === 0, "re-import creates no new exhibitors", JSON.stringify(result2));
      ok((await db.vendor.count()) === 142, "still 142 vendors after re-import");
      ok(
        (await db.tradeShowExhibitor.count()) === 142,
        "still 142 exhibitors after re-import",
        String(await db.tradeShowExhibitor.count())
      );

      // ---- hand edits must survive a re-import ----
      const sungrow = await db.vendor.findFirst({ where: { name: "Sungrow" } });
      ok(!!sungrow, "Sungrow vendor exists");
      await db.vendor.update({
        where: { id: sungrow!.id },
        data: { description: "HAND WRITTEN — utility PCS and BESS for Tulsa DC." },
      });
      const exRow = await db.tradeShowExhibitor.findFirst({ where: { vendorId: sungrow!.id } });
      await db.tradeShowExhibitor.update({
        where: { id: exRow!.id },
        data: { meetingWanted: true, notes: "HAND WRITTEN — ask about 8MWh pricing.", booth: "B1420" },
      });

      const importId3 = await stageImportCore(db, show.id, actor, {
        source: "FILE_CSV",
        columnMap: map,
        // Same company, but the file now carries a worse description and a
        // different booth. Neither may clobber what a person typed.
        rows: rows.map((r) =>
          r.companyName === "SUNGROW"
            ? { ...r, description: "Generic vendor blurb from the show portal.", booth: "ZZ999" }
            : r
        ),
      });
      await applyImportCore(db, importId3, actor);

      const after = await db.vendor.findUnique({ where: { id: sungrow!.id } });
      ok(
        after?.description === "HAND WRITTEN — utility PCS and BESS for Tulsa DC.",
        "a hand-written description is NOT overwritten by an import",
        String(after?.description)
      );
      const exAfter = await db.tradeShowExhibitor.findUnique({ where: { id: exRow!.id } });
      ok(exAfter?.booth === "B1420", "a hand-set booth is NOT overwritten", String(exAfter?.booth));
      ok(exAfter?.meetingWanted === true, "the meeting flag survives a re-import");
      ok(
        exAfter?.notes === "HAND WRITTEN — ask about 8MWh pricing.",
        "show notes survive a re-import",
        String(exAfter?.notes)
      );

      // ---- blanks DO get filled ----
      const blank = await db.vendor.findFirst({ where: { name: "Voltagrid" } });
      ok(!!blank, "Voltagrid vendor exists");
      await db.vendor.update({ where: { id: blank!.id }, data: { description: null } });
      const importId4 = await stageImportCore(db, show.id, actor, {
        source: "FILE_CSV",
        columnMap: map,
        rows: rows.map((r) =>
          r.companyName === "Voltagrid" ? { ...r, description: "Mobile power generation for data centres." } : r
        ),
      });
      await applyImportCore(db, importId4, actor);
      const blankAfter = await db.vendor.findUnique({ where: { id: blank!.id } });
      ok(
        blankAfter?.description === "Mobile power generation for data centres.",
        "an EMPTY field is filled by a later import",
        String(blankAfter?.description)
      );

      // ---- applying the same import twice is refused ----
      // The guard lives in the core rather than only in the server action, so
      // a double-submitted form or a retried request can't double-import.
      const before = await db.vendor.count();
      let refused = false;
      try {
        await applyImportCore(db, importId4, actor);
      } catch (e: any) {
        refused = /already been applied/i.test(e?.message ?? "");
      }
      ok(refused, "re-applying an applied import is refused, not silently repeated");
      ok((await db.vendor.count()) === before, "…and nothing was created by the attempt");
    } finally {
      await db.$disconnect().catch(() => {});
    }
  });
}
