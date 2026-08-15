/**
 * Meeting-task sync, against a real database.
 *
 * The behaviour that matters is not "a task appears" — it's that repeated edits
 * DON'T pile up duplicate tasks in someone's list, and that a task is never
 * silently destroyed once a person has commented on it.
 *
 * Same safety gate as the import e2e suite: refuses to run unless Z1_E2E=1 and
 * DATABASE_URL is a local SQLite file. Run with `npm run test:db`.
 */
import { ok, suite } from "./_harness";
import { syncMeetingTask } from "../src/lib/exhibitors/meetingTask";

export default async function run() {
  return suite("meeting task sync (real database)", async () => {
    const url = process.env.DATABASE_URL ?? "";
    if (process.env.Z1_E2E !== "1" || !url.startsWith("file:")) {
      console.log("        - skipped (destructive). Run `npm run test:db` to include it.");
      ok(true, "correctly did not run against a non-throwaway database");
      return;
    }

    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient();

    try {
      const owner = await db.teamMember.create({
        data: { name: "Task Owner", email: "taskowner@z1power.test" },
      });
      const other = await db.teamMember.create({
        data: { name: "Second Owner", email: "second@z1power.test" },
      });
      const project = await db.project.create({
        data: { title: "Tulsa DC Phase 1", category: "AI Data Centers" },
      });
      const show = await db.tradeShow.create({
        data: { name: "Datacloud USA 2026", startDate: new Date("2026-09-02") },
      });
      const vendor = await db.vendor.create({
        data: { name: "Sungrow", matchKey: "sungrow" },
      });
      const ex = await db.tradeShowExhibitor.create({
        data: { tradeShowId: show.id, vendorId: vendor.id, booth: "B1420" },
      });

      // --- nothing yet ---
      let r = await syncMeetingTask(db, ex.id);
      ok(r.action === "none", "no task while unflagged", JSON.stringify(r));

      // --- flagged, but nobody chasing and no project ---
      await db.tradeShowExhibitor.update({ where: { id: ex.id }, data: { meetingWanted: true } });
      r = await syncMeetingTask(db, ex.id);
      ok(r.action === "none", "flag alone doesn't create a task", JSON.stringify(r));
      ok(
        (r as any).reason?.includes("chasing"),
        "…and it says an owner is missing",
        String((r as any).reason)
      );

      // --- owner but still no project ---
      await db.tradeShowExhibitor.update({ where: { id: ex.id }, data: { ownerId: owner.id } });
      r = await syncMeetingTask(db, ex.id);
      ok(r.action === "none", "owner without a project still creates nothing", JSON.stringify(r));
      ok(
        (r as any).reason?.includes("project"),
        "…and it says which piece is missing",
        String((r as any).reason)
      );

      // --- project linked: now a task appears ---
      await db.tradeShowExhibitorProject.create({
        data: { exhibitorId: ex.id, projectId: project.id },
      });
      r = await syncMeetingTask(db, ex.id);
      ok(r.action === "created", "task created once flag + owner + project are all set", JSON.stringify(r));

      const todoId = (r as any).todoId;
      let todo = await db.todo.findUnique({
        where: { id: todoId },
        include: { assignees: true },
      });
      ok(todo?.text === "Meet Sungrow at Datacloud USA 2026 (booth B1420)", "task text reads usefully", String(todo?.text));
      ok(todo?.assignees.length === 1 && todo.assignees[0].memberId === owner.id, "assigned to the owner");
      ok(todo?.requiresConfirmation === false, "doesn't demand lead sign-off");
      ok((await db.todo.count()) === 1, "exactly one task exists");

      // --- THE important one: repeated syncs must not pile up ---
      for (let i = 0; i < 5; i++) await syncMeetingTask(db, ex.id);
      ok((await db.todo.count()) === 1, "five more syncs still leave exactly one task",
         String(await db.todo.count()));

      // --- booth changes: task text follows, no duplicate ---
      await db.tradeShowExhibitor.update({ where: { id: ex.id }, data: { booth: "C2200" } });
      r = await syncMeetingTask(db, ex.id);
      ok(r.action === "updated", "booth change updates the task", JSON.stringify(r));
      todo = await db.todo.findUnique({ where: { id: todoId }, include: { assignees: true } });
      ok(!!todo?.text.includes("C2200"), "…with the new booth", String(todo?.text));
      ok((await db.todo.count()) === 1, "still one task");

      // --- owner handover reassigns rather than duplicating ---
      await db.tradeShowExhibitor.update({ where: { id: ex.id }, data: { ownerId: other.id } });
      await syncMeetingTask(db, ex.id);
      todo = await db.todo.findUnique({ where: { id: todoId }, include: { assignees: true } });
      ok(todo?.assignees.length === 1 && todo.assignees[0].memberId === other.id,
         "reassigned to the new owner", JSON.stringify(todo?.assignees));
      ok((await db.todo.count()) === 1, "handover didn't create a second task");

      // --- marking Met ticks the task off ---
      await db.tradeShowExhibitor.update({ where: { id: ex.id }, data: { meetingStatus: "Met" } });
      r = await syncMeetingTask(db, ex.id);
      ok(r.action === "completed", "'Met' completes the task", JSON.stringify(r));
      todo = await db.todo.findUnique({ where: { id: todoId }, include: { assignees: true } });
      ok(todo?.done === true, "task is done");
      ok((await db.todo.count()) === 1, "and still exists — 'we met them' is worth keeping");

      // --- unflagging removes a clean task ---
      const ex2 = await db.tradeShowExhibitor.create({
        data: {
          tradeShowId: show.id,
          vendorId: (await db.vendor.create({ data: { name: "Fluence", matchKey: "fluence" } })).id,
          meetingWanted: true,
          ownerId: owner.id,
        },
      });
      await db.tradeShowExhibitorProject.create({ data: { exhibitorId: ex2.id, projectId: project.id } });
      const r2 = await syncMeetingTask(db, ex2.id);
      ok(r2.action === "created", "second exhibitor gets its own task");
      await db.tradeShowExhibitor.update({ where: { id: ex2.id }, data: { meetingWanted: false } });
      const r3 = await syncMeetingTask(db, ex2.id);
      ok(r3.action === "removed", "un-flagging removes the task", JSON.stringify(r3));

      // --- but NOT one somebody has discussed ---
      const ex3 = await db.tradeShowExhibitor.create({
        data: {
          tradeShowId: show.id,
          vendorId: (await db.vendor.create({ data: { name: "Vertiv", matchKey: "vertiv" } })).id,
          meetingWanted: true,
          ownerId: owner.id,
        },
      });
      await db.tradeShowExhibitorProject.create({ data: { exhibitorId: ex3.id, projectId: project.id } });
      const r4: any = await syncMeetingTask(db, ex3.id);
      await db.todoComment.create({
        data: { todoId: r4.todoId, authorId: owner.id, authorName: owner.name, body: "Spoke to them, following up." },
      });
      await db.tradeShowExhibitor.update({ where: { id: ex3.id }, data: { meetingWanted: false } });
      const r5 = await syncMeetingTask(db, ex3.id);
      ok(r5.action === "none", "a task with comments is NOT deleted", JSON.stringify(r5));
      ok(!!(await db.todo.findUnique({ where: { id: r4.todoId } })), "…it's still there");
    } finally {
      await db.$disconnect().catch(() => {});
    }
  });
}
