import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getViewableProjectIds } from "@/lib/permissions";
import Navbar from "@/components/Navbar";
import TasksHub from "@/components/TasksHub";
import type { TaskRowData } from "@/components/TaskRow";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const me = await requirePageAuth();
  const isAdmin = me.role === "ADMIN";

  const viewableIds = await getViewableProjectIds(me);

  // Projects where this person can actually edit tasks.
  const editableIds = isAdmin
    ? viewableIds
    : (
        await prisma.projectAccess.findMany({
          where: { memberId: me.id, canView: true, canEditTodos: true },
          select: { projectId: true },
        })
      ).map((r) => r.projectId);

  // THE FIX: previously this only fetched tasks assigned to the current user,
  // so assigning work to someone else made it vanish from view. Now we fetch
  // everything the person is entitled to see:
  //   1. tasks assigned to them (even on projects they can't otherwise open —
  //      being given a task is itself permission to see it), plus
  //   2. every task on any project they can view.
  const tasks = await prisma.todo.findMany({
    where: {
      OR: [{ assigneeId: me.id }, { projectId: { in: viewableIds } }],
    },
    include: {
      project: { select: { id: true, title: true } },
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: [{ done: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });

  const rows: TaskRowData[] = tasks.map((t) => ({
    id: t.id,
    text: t.text,
    done: t.done,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? null,
    projectId: t.projectId,
    projectTitle: t.project.title,
    createdByName: t.createdBy?.name ?? null,
  }));

  const [teamMembers, editableProjects, views] = await Promise.all([
    prisma.teamMember.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.project.findMany({
      where: { id: { in: editableIds }, archived: false },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    prisma.savedView.findMany({
      where: { scope: "tasks", OR: [{ ownerId: me.id }, { shared: true }] },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="min-h-screen bg-brand-greenTint">
      <Navbar active="/tasks" />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <p className="kicker mb-1">[ Z1POWER ]</p>
          <h1 className="font-heading text-3xl font-extrabold text-brand-ink">Tasks</h1>
        </div>
        <TasksHub
          tasks={rows}
          teamMembers={teamMembers}
          editableProjects={editableProjects}
          currentMemberId={me.id}
          canEditProjectIds={editableIds}
          isAdmin={isAdmin}
          savedViews={views.map((v) => ({
            id: v.id,
            name: v.name,
            filters: v.filters,
            shared: v.shared,
            isMine: v.ownerId === me.id,
          }))}
        />
      </main>
    </div>
  );
}
