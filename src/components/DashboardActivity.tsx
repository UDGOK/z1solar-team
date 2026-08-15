import Link from "next/link";
import { prisma } from "@/lib/prisma";

const ICON_COLOR: Record<string, string> = {
  "task.completed": "#4CAB3E",
  "task.created": "#3F9634",
  "file.uploaded": "#8A8A85",
  "financials.updated": "#E8743B",
  "status.changed": "#E8743B",
  "access.changed": "#8A8A85",
  "project.updated": "#3F9634",
  "project.created": "#4CAB3E",
};

function when(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  const days = Math.round(m / 1440);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

/**
 * "What did the team do since I last looked" — the question this dashboard
 * gets opened for. Every one of these events was already being logged; it was
 * just buried inside individual project pages, so answering it meant opening
 * 23 projects one at a time.
 */
export default async function DashboardActivity({ projectIds }: { projectIds: string[] }) {
  const rows = await prisma.activity.findMany({
    // Scoped to projects this person can see. Entries with no project (system
    // level) are included since they're not project-confidential.
    where: { OR: [{ projectId: { in: projectIds } }, { projectId: null }] },
    include: { project: { select: { id: true, title: true } } },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-brand-line rounded-md p-5">
        <p className="kicker mb-1">Recent activity</p>
        <p className="text-sm text-brand-inkFaint">Nothing yet — activity shows up here as the team works.</p>
      </div>
    );
  }

  // Group by day so a week of activity reads as a timeline, not a wall.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.createdAt.toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  return (
    <div className="bg-white border border-brand-line rounded-md">
      <div className="px-4 py-3 border-b border-brand-line flex items-center justify-between">
        <p className="kicker">Recent activity</p>
        <span className="text-[10px] text-brand-inkFaint">last {rows.length}</span>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {Array.from(groups.entries()).map(([day, items]) => (
          <div key={day}>
            <p className="px-4 py-1.5 text-[9px] font-mono font-bold tracking-widest text-brand-inkFaint bg-brand-greenTint/40 sticky top-0">
              {day === today ? "TODAY" : day === yesterday ? "YESTERDAY" : day.toUpperCase()}
            </p>
            {items.map((a) => (
              <div key={a.id} className="px-4 py-2 border-b border-brand-line/60 last:border-0 flex gap-2.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                  style={{ backgroundColor: ICON_COLOR[a.action] ?? "#B4B2A9" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-brand-inkSoft leading-snug">
                    <span className="font-semibold text-brand-ink">{a.actorName}</span> {a.summary}
                  </p>
                  <p className="text-[10px] text-brand-inkFaint mt-0.5">
                    {a.project && (
                      <Link href={`/projects/${a.project.id}`} className="text-brand-greenDark hover:underline">
                        {a.project.title}
                      </Link>
                    )}
                    {a.project && " · "}
                    {when(a.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
