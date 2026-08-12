import Link from "next/link";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import { fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const CATS = ["Solar & Battery", "Other Projects", "Other Matters", "New Project"] as const;
const CAT_COLOR: Record<string, string> = {
  "Solar & Battery": "bg-brand-green",
  "Other Projects": "bg-brand-greenDark",
  "Other Matters": "bg-brand-ink",
  "New Project": "bg-brand-amber",
};

export default async function DashboardPage() {
  await requirePageAuth();

  const [projects, teamCount] = await Promise.all([
    prisma.project.findMany({
      where: { archived: false },
      include: { lead: true, todos: true },
      orderBy: [{ category: "asc" }, { title: "asc" }],
    }),
    prisma.teamMember.count(),
  ]);

  const totalBudget = projects.reduce((s, p) => s + p.estBudget, 0);
  const totalSpent = projects.reduce((s, p) => s + p.actualSpend, 0);
  const totalRemaining = totalBudget - totalSpent;
  const openTodos = projects.reduce((s, p) => s + p.todos.filter((t) => !t.done).length, 0);

  const grouped = CATS.map((cat) => ({ cat, items: projects.filter((p) => p.category === cat) })).filter(
    (g) => g.items.length > 0
  );

  return (
    <div className="min-h-screen bg-brand-greenTint">
      <Navbar active="/dashboard" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <p className="kicker mb-1">[ Z1POWER — WEEKLY OPERATIONS ]</p>
          <h1 className="font-heading text-3xl font-extrabold text-brand-ink">Dashboard</h1>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          <Kpi label="Total Est. Budget" value={fmtMoney(totalBudget)} />
          <Kpi label="Total Spent" value={fmtMoney(totalSpent)} />
          <Kpi label="Remaining" value={fmtMoney(totalRemaining)} />
          <Kpi label="Open To-Dos" value={String(openTodos)} />
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-xl font-bold text-brand-ink">
            Projects <span className="text-brand-inkFaint font-body font-normal text-sm">({projects.length})</span>
          </h2>
          <div className="flex gap-2">
            <Link href="/team" className="btn-secondary text-xs">
              {teamCount} Team Members →
            </Link>
            <Link href="/projects/new" className="btn-primary text-xs">
              + New Project
            </Link>
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
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="card p-4 hover:shadow-md transition-shadow bg-white block"
                    >
                      <p className="font-heading font-bold text-brand-ink mb-2 leading-tight">{p.title}</p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-brand-inkSoft">
                          Lead: <span className="font-semibold text-brand-greenDark">{p.lead?.name || "—"}</span>
                        </span>
                        {openCount > 0 && (
                          <span className="font-mono text-brand-amber font-bold">{openCount} open</span>
                        )}
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
              <Link href="/projects/new" className="btn-primary text-sm">
                Create your first project
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-brand-line rounded-md p-4">
      <p className="text-[11px] font-mono font-bold tracking-widest text-brand-greenDark uppercase mb-1">{label}</p>
      <p className="font-heading text-2xl font-extrabold text-brand-ink">{value}</p>
    </div>
  );
}
