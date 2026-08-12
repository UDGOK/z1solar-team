import Link from "next/link";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getViewableProjectIds } from "@/lib/permissions";
import Navbar from "@/components/Navbar";
import ToggleCheckbox from "@/components/ToggleCheckbox";
import { toggleTodo } from "@/lib/actions";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MyTasksPage() {
  const member = await requirePageAuth();
  const viewableIds = await getViewableProjectIds(member);

  // Tasks assigned to me, on projects I'm allowed to see.
  const myTasks = await prisma.todo.findMany({
    where: { assigneeId: member.id, projectId: { in: viewableIds } },
    include: { project: { select: { id: true, title: true } } },
    orderBy: [{ done: "asc" }, { dueDate: "asc" }],
  });

  const open = myTasks.filter((t) => !t.done);
  const done = myTasks.filter((t) => t.done);

  return (
    <div className="min-h-screen bg-brand-greenTint">
      <Navbar active="/my-tasks" />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <p className="kicker mb-1">[ Z1POWER ]</p>
          <h1 className="font-heading text-3xl font-extrabold text-brand-ink">My Tasks</h1>
          <p className="text-sm text-brand-inkSoft mt-1">
            {open.length} open · {done.length} completed
          </p>
        </div>

        {myTasks.length === 0 ? (
          <div className="card p-10 text-center bg-white">
            <p className="text-brand-inkSoft">No tasks assigned to you yet.</p>
            <p className="text-xs text-brand-inkFaint mt-2">
              An admin assigns tasks from a project&rsquo;s edit page.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {open.length > 0 && (
              <section className="card bg-white p-5">
                <p className="kicker mb-3">Open</p>
                <div className="space-y-2">
                  {open.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </div>
              </section>
            )}
            {done.length > 0 && (
              <section className="card bg-white p-5">
                <p className="kicker mb-3">Completed</p>
                <div className="space-y-2">
                  {done.map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function TaskRow({
  task,
}: {
  task: { id: string; text: string; done: boolean; dueDate: Date | null; project: { id: string; title: string } };
}) {
  const overdue = !task.done && task.dueDate && new Date(task.dueDate) < new Date();
  return (
    <div className="flex items-start justify-between gap-3 border-b border-brand-line pb-2 last:border-0">
      <ToggleCheckbox id={task.id} checked={task.done} onToggle={toggleTodo} label={task.text} />
      <div className="shrink-0 text-right">
        <Link href={`/projects/${task.project.id}`} className="text-xs font-semibold text-brand-greenDark hover:underline">
          {task.project.title}
        </Link>
        {task.dueDate && (
          <p className={`text-[11px] font-mono ${overdue ? "text-red-600 font-bold" : "text-brand-inkFaint"}`}>
            {overdue ? "OVERDUE " : "DUE "}
            {fmtDate(task.dueDate)}
          </p>
        )}
      </div>
    </div>
  );
}
