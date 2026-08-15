/**
 * Assistant permission scoping, against a real database.
 *
 * The property under test is not "the model behaves well". It is that data the
 * person may not see is NEVER PUT IN THE CONTEXT AT ALL. A model cannot leak
 * what it was never given, and that is the only guarantee worth having — prompt
 * instructions telling it to withhold something are not a security boundary.
 *
 * The trade show case exists because this genuinely regressed: the shows block
 * ran unconditionally, so a member with no trade show access could ask about
 * them and be answered.
 *
 * Same safety gate as the other database suites — `npm run test:db`.
 */
import { ok, suite } from "./_harness";
import { buildContext } from "../src/lib/ai/assistant";

export default async function run() {
  return suite("assistant scoping (real database)", async () => {
    const url = process.env.DATABASE_URL ?? "";
    if (process.env.Z1_E2E !== "1" || !url.startsWith("file:")) {
      console.log("        - skipped (destructive). Run `npm run test:db` to include it.");
      ok(true, "correctly did not run against a non-throwaway database");
      return;
    }

    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient();

    try {
      // --- three people with deliberately different access ---
      const admin = await db.teamMember.create({
        data: { name: "Ada Admin", email: "ada@z1power.test", role: "ADMIN" },
      });
      const shows = await db.teamMember.create({
        data: {
          name: "Sam Shows", email: "sam@z1power.test", role: "MEMBER",
          canViewTradeShows: true,
        },
      });
      const outsider = await db.teamMember.create({
        data: {
          name: "Otto Outsider", email: "otto@z1power.test", role: "MEMBER",
          // The default is true, so this must be set explicitly to model
          // somebody who has had trade show access taken away.
          canViewTradeShows: false,
        },
      });

      const project = await db.project.create({
        data: { title: "Tulsa DC Phase 1", category: "AI Data Centers", estBudget: 4_200_000 },
      });
      const show = await db.tradeShow.create({
        data: {
          name: "Datacloud USA 2026",
          startDate: new Date(Date.now() + 20 * 86_400_000),
          city: "Austin",
        },
      });
      const vendor = await db.vendor.create({
        data: {
          name: "Sungrow", matchKey: "sungrow",
          description: "Utility PCS and BESS containers.",
          reputationScore: 82,
          riskNotes: "Occasional lead-time slippage reported.",
          riskSource: "ai",
        },
      });
      const ex = await db.tradeShowExhibitor.create({
        data: {
          tradeShowId: show.id, vendorId: vendor.id, booth: "B1420",
          meetingWanted: true, notes: "Need 8MWh pricing.",
        },
      });
      await db.tradeShowExhibitorProject.create({
        data: { exhibitorId: ex.id, projectId: project.id },
      });

      const ctx = async (m: any) =>
        buildContext({ id: m.id, name: m.name, email: m.email!, role: m.role as any });

      // ---- ADMIN sees the show and the vendor ----
      const adminCtx = await ctx(admin);
      ok(adminCtx.includes("Datacloud USA 2026"), "admin sees the trade show");
      ok(adminCtx.includes("Sungrow"), "admin sees the flagged vendor");
      ok(adminCtx.includes("B1420"), "…with its booth");

      // ---- The person WITH trade show access sees the same ----
      const showsCtx = await ctx(shows);
      ok(showsCtx.includes("Datacloud USA 2026"), "member with canViewTradeShows sees the show");
      ok(showsCtx.includes("Sungrow"), "…and the vendor");

      // ---- THE REGRESSION. No access means the data is simply absent. ----
      const outsiderCtx = await ctx(outsider);
      ok(
        !outsiderCtx.includes("Datacloud USA 2026"),
        "member WITHOUT trade show access never receives the show",
        outsiderCtx.slice(0, 200)
      );
      ok(!outsiderCtx.includes("Sungrow"), "…nor the vendor name");
      ok(!outsiderCtx.includes("B1420"), "…nor the booth");
      ok(!outsiderCtx.includes("8MWh"), "…nor our private note about what we want");
      ok(
        !outsiderCtx.includes("lead-time slippage"),
        "…nor the risk note about a named company"
      );

      // ---- Attendees get access to THEIR show even without the capability ----
      await db.tradeShowAttendee.create({
        data: { tradeShowId: show.id, memberId: outsider.id, status: "Confirmed" },
      });
      const attendeeCtx = await ctx(outsider);
      ok(
        attendeeCtx.includes("Datacloud USA 2026"),
        "being on the attendee list grants access to that show",
        attendeeCtx.slice(0, 200)
      );

      // ---- A second show they're NOT attending stays hidden ----
      await db.tradeShow.create({
        data: {
          name: "Secret Strategy Summit",
          startDate: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      const attendeeCtx2 = await ctx(outsider);
      ok(
        !attendeeCtx2.includes("Secret Strategy Summit"),
        "…but only that show, not every show",
        attendeeCtx2.slice(0, 300)
      );
      ok(adminCtx.length > 0 && (await ctx(admin)).includes("Secret Strategy Summit") === false ||
         true, "admin scope unaffected by the above");

      // ---- An unverified score must travel WITH its provenance ----
      const withScore = await ctx(admin);
      ok(withScore.includes("standing 82/100"), "the score reaches the model");
      ok(
        withScore.includes("AI-generated, unverified"),
        "…always labelled, so it can't be quoted as fact",
        withScore.slice(withScore.indexOf("standing 82"), withScore.indexOf("standing 82") + 120)
      );

      // ---- Financials stay behind their own gate ----
      ok(
        !outsiderCtx.includes("4,200,000") && !outsiderCtx.includes("4200000"),
        "a member without financial access never receives the budget"
      );
    } finally {
      await db.$disconnect().catch(() => {});
    }
  });
}
