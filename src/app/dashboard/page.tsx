import Link from "next/link";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import Navbar from "@/components/Navbar";

export const dynamic = "force-dynamic";

const CATS = ["Solar & Battery", "Other Projects", "Other Matters", "New Project"] as const;
const CAT_COLOR: Record<string, string> = {
  "Solar & Battery": "bg-brand-green",
  "Other Projects": "bg-brand-greenDark",
  "Other Matters": "bg-brand-ink",
  "New Project": "bg-brand-amber",
};
const STATUS_COLOR: Record<string, string> = {
  Planning: "#8A8A85",
  "On Track": "#4CAB3E",
  "At Risk": "#E8743B",
  Delayed: "#C0392B",
  Complete: "#3F9634",
};

export default async function DashboardPage() {
  const session = await requirePageAuth();
  const isAdmin = session.role === "ADMIN";

  const [projects, teamCount, settings] = await Promise.all([
    prisma.project.findMany({
      where: { archived: false },
      include: { lead: true, todos: true },
      orderBy: [{ category: "asc" }, { title: "asc" }],
    }),
    prisma.teamMember.count(),
    getSettings(),
  ]);

  const onTrack = projects.filter((p) => p.status === "On Track").length;
  const needsAttention = projects.filter((p) => p.status === "At Risk" || p.status === "Delayed").length;
  const complete = projects.filter((p) => p.status === "Complete").length;

  const grouped = CATS.map((cat) => ({ cat, items: projects.filter((p) => p.category === cat) })).filter(
    (g) => g.items.length > 0
  );

  return (
    <div className="min-h-screen bg-brand-greenTint">
      <Navbar active="/dashboard" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="kicker mb-1">[ Z1POWER — WEEKLY OPERATIONS ]</p>
            <h1 className="font-heading text-3xl font-extrabold text-brand-ink">Dashboard</h1>
          </div>
          {settings.meetingLink ? (
            <a
              href={settings.meetingLink}
              target="_blank"
              rel="noreferrer"
              className="btn-primary !px-5 !py-3 text-sm shrink-0"
            >
              ▶ Join Weekly Meeting
            </a>
          ) : (
            <a href="/settings" className="btn-secondary text-xs shrink-0">
              + Add weekly meeting link
            </a>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          <Kpi label="Total Projects" value={String(projects.length)} color="#1C1C1C" />
          <Kpi label="On Track" value={String(onTrack)} color={STATUS_COLOR["On Track"]} />
          <Kpi label="Needs Attention" value={String(needsAttention)} color={STATUS_COLOR["At Risk"]} />
          <Kpi label="Complete" value={String(complete)} color={STATUS_COLOR["Complete"]} />
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-xl font-bold text-brand-ink">
            Project Highlights <span className="text-brand-inkFaint font-body font-normal text-sm">({projects.length})</span>
          </h2>
          <div className="flex gap-2">
            <Link href="/team" className="btn-secondary text-xs">
              {teamCount} Team Members →
            </Link>
            {isAdmin && (
              <Link href="/projects/new" className="btn-primary text-xs">
                + New Project
              </Link>
            )}
          </div>
        </div>

        <div className="space-y-8">
          {grouped.map((g) => (
            <section key={g.cat}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2.5 h-2.5 rounded-full ${CAT_COLOR[g.cat]}`} />
                <h3 className="tag text-brand-inkSoft">{g.cat}</h3>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {g.items.map((p) => {
                  const openCount = p.todos.filter((t) => !t.done).length;
                  const statusColor = STATUS_COLOR[p.status] || STATUS_COLOR.Planning;
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="card p-4 hover:shadow-md transition-shadow bg-white block"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-heading font-bold text-brand-ink leading-tight">{p.title}</p>
                        <span
                          className="shrink-0 px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider text-white"
                          style={{ backgroundColor: statusColor }}
                        >
                          {p.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-brand-greenTint rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.max(0, Math.min(100, p.completionPct))}%`, backgroundColor: statusColor }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-brand-inkSoft">
                          Lead: <span className="font-semibold text-brand-greenDark">{p.lead?.name || "—"}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-brand-inkFaint">{p.completionPct}%</span>
                          {openCount > 0 && (
                            <span className="font-mono text-brand-amber font-bold">{openCount} open</span>
                          )}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
          {projects.length === 0 && (
            <div className="card p-10 text-center bg-white">
              <p className="text-brand-inkSoft mb-4">No projects yet.</p>
              {isAdmin && (
                <Link href="/projects/new" className="btn-primary text-sm">
                  Create your first project
                </Link>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-brand-line rounded-md p-4">
      <p className="text-[11px] font-mono font-bold tracking-widest text-brand-greenDark uppercase mb-1">{label}</p>
      <p className="font-heading text-2xl font-extrabold" style={{ color }}>{value}</p>
    </div>
  );
}
