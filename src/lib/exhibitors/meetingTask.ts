import type { PrismaClient } from "@prisma/client";

/**
 * Keeps a task in sync with an exhibitor's meeting flag, so whoever is chasing
 * a vendor sees it in their own Tasks list rather than only inside the trade
 * show module.
 *
 * ONE task per exhibitor, tracked by TradeShowExhibitor.todoId. Re-running this
 * updates that task rather than creating another — otherwise every edit to the
 * booth number would leave a fresh duplicate behind.
 *
 * WHY IT NEEDS A PROJECT
 * Todo.projectId is required by the schema; a task cannot exist outside a
 * project. So a task appears only once the meeting is flagged, has an owner,
 * AND is linked to at least one project. That is a real constraint, not an
 * oversight — making projectId nullable would touch the dashboard, the project
 * pages, the weekly report and the tasks grouping, which is not a change worth
 * making three weeks before a show. The UI tells you which piece is missing.
 *
 * It also stops the flood. Flagging forty vendors while walking a floor does
 * not put forty tasks in anyone's list; assigning an owner and a project does,
 * and that is a deliberate act.
 */

export type TaskSyncResult =
  | { action: "created"; todoId: string }
  | { action: "updated"; todoId: string }
  | { action: "completed"; todoId: string }
  | { action: "removed" }
  | { action: "none"; reason: string };

function taskText(vendorName: string, showName: string, booth: string | null): string {
  const where = booth ? ` (booth ${booth})` : "";
  return `Meet ${vendorName} at ${showName}${where}`;
}

export async function syncMeetingTask(
  db: PrismaClient,
  exhibitorId: string
): Promise<TaskSyncResult> {
  const ex = await db.tradeShowExhibitor.findUnique({
    where: { id: exhibitorId },
    include: {
      vendor: { select: { name: true } },
      tradeShow: { select: { name: true, startDate: true } },
      projects: { select: { projectId: true } },
    },
  });
  if (!ex) return { action: "none", reason: "Exhibitor no longer exists." };

  const existingId = ex.todoId;
  const wantsTask = ex.meetingWanted && !!ex.ownerId && ex.projects.length > 0;

  // --- the meeting happened, or was called off ---
  if (existingId && (ex.meetingStatus === "Met" || ex.meetingStatus === "No longer needed")) {
    const todo = await db.todo.findUnique({ where: { id: existingId } });
    if (!todo) {
      await db.tradeShowExhibitor.update({ where: { id: exhibitorId }, data: { todoId: null } });
      return { action: "none", reason: "Task had already been deleted." };
    }
    if (ex.meetingStatus === "Met") {
      // Tick it rather than delete it — "we met them" is worth keeping.
      if (!todo.done) {
        await db.todo.update({
          where: { id: existingId },
          data: { done: true, completedById: ex.ownerId, completedAt: new Date() },
        });
      }
      return { action: "completed", todoId: existingId };
    }
    // "No longer needed" — the task is noise now. Remove it, but only if
    // nobody has commented; a discussion is worth more than a tidy list.
    const comments = await db.todoComment.count({ where: { todoId: existingId } });
    if (comments === 0) {
      await db.todo.delete({ where: { id: existingId } }).catch(() => {});
      await db.tradeShowExhibitor.update({ where: { id: exhibitorId }, data: { todoId: null } });
      return { action: "removed" };
    }
    await db.todo.update({ where: { id: existingId }, data: { done: true } });
    return { action: "completed", todoId: existingId };
  }

  // --- no task wanted ---
  if (!wantsTask) {
    if (!existingId) {
      const missing = !ex.meetingWanted
        ? "not flagged for a meeting"
        : !ex.ownerId
          ? "no one is chasing it yet"
          : "no project linked yet";
      return { action: "none", reason: missing };
    }
    // Was wanted, isn't now — unflagged, or the owner/project was cleared.
    const comments = await db.todoComment.count({ where: { todoId: existingId } });
    if (comments === 0) {
      await db.todo.delete({ where: { id: existingId } }).catch(() => {});
      await db.tradeShowExhibitor.update({ where: { id: exhibitorId }, data: { todoId: null } });
      return { action: "removed" };
    }
    return { action: "none", reason: "Task kept — it has comments on it." };
  }

  // --- create or update ---
  const projectId = ex.projects[0].projectId;
  const text = taskText(ex.vendor.name, ex.tradeShow.name, ex.booth);

  if (existingId) {
    const todo = await db.todo.findUnique({
      where: { id: existingId },
      include: { assignees: { select: { memberId: true } } },
    });
    if (todo) {
      await db.todo.update({
        where: { id: existingId },
        data: { text, projectId, done: false, completedById: null, completedAt: null },
      });
      // Reassign only when the owner actually changed, so an unrelated edit
      // doesn't churn the join table.
      const current = todo.assignees.map((a) => a.memberId);
      if (current.length !== 1 || current[0] !== ex.ownerId) {
        await db.todoAssignee.deleteMany({ where: { todoId: existingId } });
        await db.todoAssignee.create({ data: { todoId: existingId, memberId: ex.ownerId! } });
      }
      return { action: "updated", todoId: existingId };
    }
    // Row pointed at a task somebody deleted by hand — fall through and recreate.
  }

  const max = await db.todo.aggregate({ where: { projectId }, _max: { order: true } });
  const created = await db.todo.create({
    data: {
      projectId,
      text,
      order: (max._max.order ?? 0) + 1,
      createdById: ex.ownerId,
      // Deliberately NOT requiring lead confirmation. That two-stage flow exists
      // for delivery commitments out of meetings; "go and talk to someone at a
      // booth" doesn't need a second person to sign it off.
      requiresConfirmation: false,
    },
  });
  await db.todoAssignee.create({ data: { todoId: created.id, memberId: ex.ownerId! } });
  await db.tradeShowExhibitor.update({
    where: { id: exhibitorId },
    data: { todoId: created.id },
  });

  return { action: "created", todoId: created.id };
}
