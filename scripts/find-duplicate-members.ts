/**
 * Finds and (optionally) removes the empty duplicate team members created by
 * the old seed script.
 *
 *   npx tsx scripts/find-duplicate-members.ts            <- report only, changes nothing
 *   npx tsx scripts/find-duplicate-members.ts --delete   <- actually removes them
 *
 * BACKGROUND
 * prisma/seed.ts used to look up team members by exact name on every run. Once
 * someone was renamed in the app ("Yasir" -> "Yasir Jahangir") the lookup
 * missed, and the seed created a fresh empty record. Each seeded deploy added
 * more. The seed no longer does this, but the records it already made are still
 * there.
 *
 * SAFETY
 * A record is only ever considered a stub when ALL of these are true:
 *   - no email
 *   - no phone
 *   - no password set
 *   - never signed in
 *   - not an ADMIN
 *   - a different member exists whose name starts with this one
 * A real person who simply hasn't filled in their profile fails the last test,
 * because nobody else is named "<their name> something".
 *
 * Even then, nothing is deleted while the record is referenced by anything —
 * a task, a project, a meeting. Those are listed instead so a human decides.
 */

import { PrismaClient } from "@prisma/client";
import { NAME_ALIASES } from "../src/lib/meetingExtract";

const prisma = new PrismaClient();
const DO_DELETE = process.argv.includes("--delete");

type Ref = { label: string; count: number };

async function referencesFor(id: string): Promise<Ref[]> {
  const [
    leadOf, ownerOf, memberships, access, assignedTodos, todoAssignments,
    todosCompleted, todosConfirmed, todoComments, createdTodos, meetingsOrganized,
    meetingAttendance, agendaOwned, meetingImports, purchasesRequested,
    purchasesApproved, purchaseComments, resourcesUploaded, sentMessages,
    messageReceipts, notifications, activities, savedViews, chatThreads,
    subscriptions, tradeShowAttendance, smsMessages,
  ] = await Promise.all([
    prisma.project.count({ where: { leadId: id } }),
    prisma.project.count({ where: { ownerId: id } }),
    prisma.projectMember.count({ where: { memberId: id } }),
    prisma.projectAccess.count({ where: { memberId: id } }),
    prisma.todo.count({ where: { assigneeId: id } }),
    prisma.todoAssignee.count({ where: { memberId: id } }),
    prisma.todo.count({ where: { completedById: id } }),
    prisma.todo.count({ where: { confirmedById: id } }),
    prisma.todoComment.count({ where: { authorId: id } }),
    prisma.todo.count({ where: { createdById: id } }),
    prisma.meeting.count({ where: { organizerId: id } }),
    prisma.meetingAttendee.count({ where: { memberId: id } }),
    prisma.meetingAgendaItem.count({ where: { ownerId: id } }),
    prisma.meetingImport.count({ where: { importedById: id } }),
    prisma.purchaseRequest.count({ where: { requestedById: id } }),
    prisma.purchaseRequest.count({ where: { approvedById: id } }),
    prisma.purchaseComment.count({ where: { authorId: id } }),
    prisma.resource.count({ where: { uploadedById: id } }),
    prisma.message.count({ where: { senderId: id } }),
    prisma.messageRecipient.count({ where: { memberId: id } }),
    prisma.notification.count({ where: { recipientId: id } }),
    prisma.activity.count({ where: { actorId: id } }),
    prisma.savedView.count({ where: { ownerId: id } }),
    prisma.chatThread.count({ where: { memberId: id } }),
    prisma.reportSubscription.count({ where: { memberId: id } }),
    prisma.tradeShowAttendee.count({ where: { memberId: id } }),
    prisma.smsMessage.count({ where: { memberId: id } }),
  ]);

  const all: Ref[] = [
    { label: "project lead on", count: leadOf },
    { label: "project owner of", count: ownerOf },
    { label: "project memberships", count: memberships },
    { label: "project access rows", count: access },
    { label: "tasks assigned (legacy field)", count: assignedTodos },
    { label: "task assignments", count: todoAssignments },
    { label: "tasks completed", count: todosCompleted },
    { label: "tasks confirmed", count: todosConfirmed },
    { label: "task comments", count: todoComments },
    { label: "tasks created", count: createdTodos },
    { label: "meetings organised", count: meetingsOrganized },
    { label: "meeting attendance", count: meetingAttendance },
    { label: "agenda items owned", count: agendaOwned },
    { label: "meeting imports", count: meetingImports },
    { label: "purchases requested", count: purchasesRequested },
    { label: "purchases approved", count: purchasesApproved },
    { label: "purchase comments", count: purchaseComments },
    { label: "resources uploaded", count: resourcesUploaded },
    { label: "messages sent", count: sentMessages },
    { label: "message receipts", count: messageReceipts },
    { label: "notifications", count: notifications },
    { label: "activity log entries", count: activities },
    { label: "saved views", count: savedViews },
    { label: "chat threads", count: chatThreads },
    { label: "report subscriptions", count: subscriptions },
    { label: "trade show attendance", count: tradeShowAttendance },
    { label: "SMS messages", count: smsMessages },
  ];
  return all.filter((r) => r.count > 0);
}

async function main() {
  const members = await prisma.teamMember.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, title: true, email: true, phone: true,
      role: true, passwordHash: true, lastSeenAt: true, createdAt: true,
    },
  });

  console.log(`\n${members.length} team members in the database.\n`);

  // Reuses the alias table the meeting extractor already relies on. Without it
  // a plain prefix test misses the two that matter most here: the stub is
  // "Mohammad" while the real record is "Muhammad Siddiki", and "Javaid" while
  // the real record is "Javed Iqbal Ph. D". Different spellings, same person —
  // which is precisely why that table exists.
  const firstName = (full: string) => full.trim().split(/\s+/)[0].toLowerCase();
  const canonical = (name: string) => {
    const f = firstName(name);
    return NAME_ALIASES[f] ?? f;
  };

  /** The fuller record this bare name is a stub of, if there is one. */
  const fullerRecordFor = (m: { id: string; name: string }) => {
    const key = canonical(m.name);
    return members.find(
      (o) =>
        o.id !== m.id &&
        canonical(o.name) === key &&
        // The survivor must be the more complete record: more than one word.
        o.name.trim().split(/\s+/).length > m.name.trim().split(/\s+/).length
    );
  };

  const stubs = members.filter((m) => {
    if (m.email || m.phone || m.passwordHash || m.lastSeenAt) return false;
    if (m.role === "ADMIN") return false;
    // A single bare word only. "Javed Iqbal Ph. D" is never a stub.
    if (m.name.trim().split(/\s+/).length > 1) return false;
    return !!fullerRecordFor(m);
  });

  const real = members.filter((m) => !stubs.some((s) => s.id === m.id));

  console.log("KEEPING these — they have contact details, sign-in history, or a unique name:");
  for (const m of real) {
    const bits = [m.title, m.email, m.phone].filter(Boolean).join(" · ");
    console.log(`   ${m.name.padEnd(24)} ${bits || "(no details yet)"}`);
  }

  if (stubs.length === 0) {
    console.log("\nNo duplicate stubs found. Nothing to do.\n");
    return;
  }

  console.log(`\nFound ${stubs.length} empty duplicate(s):\n`);

  let blocked = 0;
  const deletable: typeof stubs = [];

  for (const s of stubs) {
    const longer = fullerRecordFor(s);
    const refs = await referencesFor(s.id);
    console.log(`   "${s.name}"  (created ${s.createdAt.toISOString().slice(0, 10)})`);
    console.log(`      looks like a stub of: "${longer?.name}"`);
    if (refs.length === 0) {
      console.log("      referenced by: nothing — safe to remove");
      deletable.push(s);
    } else {
      blocked++;
      console.log("      REFERENCED BY:");
      refs.forEach((r) => console.log(`         ${r.count} × ${r.label}`));
      console.log("      NOT removing — reassign these in the app first.");
    }
    console.log("");
  }

  if (!DO_DELETE) {
    console.log("This was a dry run. Nothing was changed.");
    console.log(
      `Re-run with --delete to remove the ${deletable.length} unreferenced duplicate(s).\n`
    );
    return;
  }

  if (deletable.length === 0) {
    console.log("Nothing safe to delete.\n");
    return;
  }

  for (const s of deletable) {
    await prisma.teamMember.delete({ where: { id: s.id } });
    console.log(`   Removed "${s.name}"`);
  }
  console.log(
    `\nRemoved ${deletable.length} duplicate(s).${blocked ? ` ${blocked} left alone because they're still referenced.` : ""}\n`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
