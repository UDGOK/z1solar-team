import Link from "next/link";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { getViewableProjectIds, getGlobalCapabilities, getProjectPermissions } from "@/lib/permissions";
import { categoryColor, sortCategories } from "@/lib/categories";
import AppShell from "@/components/AppShell";
import CategorySection from "@/components/CategorySection";
import DashboardActivity from "@/components/DashboardActivity";
import PortfolioRollup from "@/components/PortfolioRollup";
import type { CardProject } from "@/components/ProjectCard";

import { PAGE_CONTAINER } from "@/lib/layout";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const member = await requirePageAuth();
  const isAdmin = member.role === "ADMIN";

  const viewableIds = await getViewableProjectIds(member);
  const [projects, settings, caps] = await Promise.all([
    prisma.project.findMany({
      where: { archived: false, id: { in: viewableIds } },
      include: {
        lead: { select: { name: true } },
        todos: { select: { done: true, dueDate: true } },
      },
      orderBy: [{ category: "asc" }, { title: "asc" }],
    }),
    getSettings(),
    getGlobalCapabilities(member),
  ]);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const cards: CardProject[] = projects.map((p) => {
    const open = p.todos.filter((t) => !t.done);
    return {
      id: p.id,
      title: p.highlightTitle || p.title,
      priority: p.priority,
      status: p.status,
      completionPct: p.completionPct,
      leadName: p.lead?.name ?? null,
      openTodos: open.length,
      overdueTodos: open.filter((t) => t.dueDate && t.dueDate < startOfToday).length,
    };
  });

  // Which of these the viewer may quick-edit. Resolved per project because
  // ownership and role grants differ project by project.
  const editableIds: string[] = [];
  for (const p of projects) {
    if (isAdmin || p.ownerId === member.id) {
      editableIds.push(p.id);
      continue;
    }
    const perms = await getProjectPermissions(member, p.id);
    if (perms.canEditStatus) editableIds.push(p.id);
  }

  const active = cards.filter((c) => !(c.completionPct === 0 && c.status === "Planning")).length;
  const overdue = cards.reduce((n, c) => n + c.overdueTodos, 0);
  const unowned = cards.filter((c) => !c.leadName).length;

  const byCategory = new Map<string, CardProject[]>();
  projects.forEach((p, i) => {
    const list = byCategory.get(p.category) ?? [];
    list.push(cards[i]);
    byCategory.set(p.category, list);
  });
  const orderedCategories = sortCategories(Array.from(byCategory.keys()));

  return (
    <AppShell active="/dashboard">
      <main className={`${PAGE_CONTAINER}`}>
        <div className="flex justify-between items-start gap-3 mb-4 flex-wrap">
          <div>
            <p className="text-[8.5px] font-semibold tracking-[0.14em] text-brand-green">[ WEEKLY OPERATIONS ]</p>
            <h1 className="font-heading font-extrabold text-[20px] sm:text-[22px] text-brand-ink tracking-tight mt-0.5">
              Dashboard
            </h1>
          </div>
          {settings.meetingLink ? (
            <a href={settings.meetingLink} target="_blank" rel="noreferrer" className="btn-primary !text-[11px] !px-3 !py-1.5 shrink-0">
              ▶ Join meeting
            </a>
          ) : (
            <Link href="/settings" className="btn-secondary !text-[11px] shrink-0">+ Add meeting link</Link>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5 mb-5">
          <Stat label="ACTIVE" value={active} />
          <Stat label="OVERDUE" value={overdue} color="#C0392B" accent />
          <Stat label="UNOWNED" value={unowned} color="#E8743B" accent />
          <Stat label="TOTAL" value={cards.length} />
        </div>

        {/* Portfolio position and what the team has been doing — the two
            questions this page actually gets opened for. */}
        <div className="grid lg:grid-cols-2 gap-3 mb-5">
          {caps.canViewAllFinancials || isAdmin ? (
            <PortfolioRollup projectIds={viewableIds} />
          ) : (
            <div />
          )}
          <DashboardActivity projectIds={viewableIds} />
        </div>

        {orderedCategories.map((name) => (
          <CategorySection
            key={name}
            name={name}
            color={categoryColor(name)}
            projects={byCategory.get(name) ?? []}
            canEditIds={editableIds}
          />
        ))}

        {cards.length === 0 && (
          <div className="bg-white border border-brand-line rounded-md p-8 text-center">
            <p className="text-sm text-brand-inkSoft mb-3">No projects visible on your account yet.</p>
            {caps.canCreateProjects && (
              <Link href="/projects/new" className="btn-primary text-xs">Create a project</Link>
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}

function Stat({ label, value, color, accent }: { label: string; value: number; color?: string; accent?: boolean }) {
  return (
    <div
      className="bg-white border border-brand-line rounded-[5px] px-3 py-2.5"
      style={accent && color ? { borderLeft: `3px solid ${color}`, borderRadius: "0 5px 5px 0" } : undefined}
    >
      <p className="text-[8px] font-semibold tracking-[0.1em]" style={{ color: color ?? "#8A8A85" }}>{label}</p>
      <p className="font-heading font-extrabold text-[20px] mt-0.5" style={{ color: color ?? "#1C1C1C" }}>{value}</p>
    </div>
  );
}
