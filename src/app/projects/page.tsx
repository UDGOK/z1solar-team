import Link from "next/link";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getViewableProjectIds, getGlobalCapabilities, getProjectPermissions } from "@/lib/permissions";
import { categoryColor, sortCategories } from "@/lib/categories";
import { PAGE_CONTAINER } from "@/lib/layout";
import AppShell from "@/components/AppShell";
import ProjectRow, { type ProjectRowData } from "@/components/ProjectRow";
import { fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category: filter } = await searchParams;
  const member = await requirePageAuth();
  const isAdmin = member.role === "ADMIN";

  const viewableIds = await getViewableProjectIds(member);
  const [projects, caps] = await Promise.all([
    prisma.project.findMany({
      where: { archived: false, id: { in: viewableIds } },
      include: { lead: { select: { name: true } }, todos: { select: { done: true } } },
      orderBy: [{ category: "asc" }, { title: "asc" }],
    }),
    getGlobalCapabilities(member),
  ]);

  // Financial visibility differs per project, so the budget column only shows
  // when the viewer can see financials on every project listed — otherwise a
  // partially-filled column implies figures are zero rather than hidden.
  let showBudget = isAdmin || caps.canViewAllFinancials;
  const editableIds: string[] = [];
  const deletableIds: string[] = [];
  for (const p of projects) {
    const owned = p.ownerId === member.id;
    if (isAdmin || owned) {
      editableIds.push(p.id);
      deletableIds.push(p.id);
    } else {
      const perms = await getProjectPermissions(member, p.id);
      if (perms.canEditStatus) editableIds.push(p.id);
      if (caps.canDeleteAnyProject) deletableIds.push(p.id);
      if (!perms.canViewFinancials) showBudget = false;
    }
  }

  const rows: ProjectRowData[] = projects.map((p) => ({
    id: p.id,
    title: p.title,
    category: p.category,
    priority: p.priority,
    status: p.status,
    leadName: p.lead?.name ?? null,
    budget: fmtMoney(p.estBudget),
    openTodos: p.todos.filter((t) => !t.done).length,
  }));

  const allCategories = sortCategories(Array.from(new Set(projects.map((p) => p.category))));
  const visible = filter ? rows.filter((r) => r.category === filter) : rows;

  return (
    <AppShell active="/projects">
      <main className={`${PAGE_CONTAINER}`}>
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <p className="text-[8.5px] font-semibold tracking-[0.14em] text-brand-green">[ Z1POWER ]</p>
            <h1 className="font-heading font-extrabold text-[20px] sm:text-[22px] text-brand-ink tracking-tight mt-0.5">
              {filter || "All Projects"}
            </h1>
            <p className="text-[11px] text-brand-inkSoft mt-0.5">
              {visible.length} project{visible.length === 1 ? "" : "s"}
              {filter && <> · <Link href="/projects" className="text-brand-greenDark hover:underline">show all</Link></>}
            </p>
          </div>
          {caps.canCreateProjects && (
            <Link href="/projects/new" className="btn-primary !text-[11px] !px-3 !py-1.5 shrink-0">+ New Project</Link>
          )}
        </div>

        <div className="flex gap-1.5 flex-wrap mb-3">
          <Link
            href="/projects"
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              !filter ? "bg-brand-ink text-white border-brand-ink" : "bg-white text-brand-inkSoft border-brand-line hover:border-brand-inkFaint"
            }`}
          >
            All {rows.length}
          </Link>
          {allCategories.map((c) => {
            const n = rows.filter((r) => r.category === c).length;
            const on = filter === c;
            return (
              <Link
                key={c}
                href={`/projects?category=${encodeURIComponent(c)}`}
                className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  on ? "bg-brand-ink text-white border-brand-ink" : "bg-white text-brand-inkSoft border-brand-line hover:border-brand-inkFaint"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: categoryColor(c) }} />
                {c} {n}
              </Link>
            );
          })}
        </div>

        <div className="bg-white border border-brand-line rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-ink text-white text-left">
                <th className="px-4 py-2.5 font-mono text-[10px] tracking-widest">TITLE</th>
                <th className="px-4 py-2.5 font-mono text-[10px] tracking-widest">CATEGORY</th>
                <th className="px-4 py-2.5 font-mono text-[10px] tracking-widest">LEAD</th>
                <th className="px-4 py-2.5 font-mono text-[10px] tracking-widest">STATUS</th>
                <th className="px-4 py-2.5 font-mono text-[10px] tracking-widest">PRIORITY</th>
                {showBudget && <th className="px-4 py-2.5 font-mono text-[10px] tracking-widest text-right">BUDGET</th>}
                <th className="px-4 py-2.5 font-mono text-[10px] tracking-widest text-right">OPEN</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <ProjectRow
                  key={r.id}
                  project={r}
                  zebra={i % 2 === 1}
                  canEdit={editableIds.includes(r.id)}
                  canDelete={deletableIds.includes(r.id)}
                  showBudget={showBudget}
                />
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={showBudget ? 7 : 6} className="px-4 py-10 text-center text-brand-inkFaint">
                    No projects here yet.{" "}
                    {caps.canCreateProjects && (
                      <Link href="/projects/new" className="text-brand-greenDark font-semibold">Create one →</Link>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-brand-inkFaint mt-2">
          Hover a row to rename or delete. Deleting removes the project&rsquo;s tasks, files and financial records.
        </p>
      </main>
    </AppShell>
  );
}
