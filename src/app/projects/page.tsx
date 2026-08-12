import Link from "next/link";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getHiddenProjectIds } from "@/lib/permissions";
import Navbar from "@/components/Navbar";
import { fmtMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const member = await requirePageAuth();
  const isAdmin = member.role === "ADMIN";
  const [allProjects, hiddenIds] = await Promise.all([
    prisma.project.findMany({
      where: { archived: false },
      include: { lead: true, todos: true },
      orderBy: [{ category: "asc" }, { title: "asc" }],
    }),
    getHiddenProjectIds(member),
  ]);
  const projects = allProjects.filter((p) => !hiddenIds.has(p.id));

  return (
    <div className="min-h-screen bg-brand-greenTint">
      <Navbar active="/projects" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="kicker mb-1">[ Z1POWER ]</p>
            <h1 className="font-heading text-3xl font-extrabold text-brand-ink">All Projects</h1>
          </div>
          {isAdmin && (
            <Link href="/projects/new" className="btn-primary">
              + New Project
            </Link>
          )}
        </div>

        <div className="bg-white border border-brand-line rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-ink text-white text-left">
                <th className="px-4 py-3 font-mono text-xs tracking-widest">TITLE</th>
                <th className="px-4 py-3 font-mono text-xs tracking-widest">CATEGORY</th>
                <th className="px-4 py-3 font-mono text-xs tracking-widest">LEAD</th>
                <th className="px-4 py-3 font-mono text-xs tracking-widest">STATUS</th>
                {isAdmin && <th className="px-4 py-3 font-mono text-xs tracking-widest text-right">BUDGET</th>}
                <th className="px-4 py-3 font-mono text-xs tracking-widest text-right">OPEN TO-DOS</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-t border-brand-line ${i % 2 === 1 ? "bg-brand-greenTint" : ""} hover:bg-green-50`}
                >
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="font-semibold text-brand-ink hover:text-brand-greenDark">
                      {p.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-brand-inkSoft">{p.category}</td>
                  <td className="px-4 py-3 text-brand-greenDark font-semibold">{p.lead?.name || "—"}</td>
                  <td className="px-4 py-3 text-brand-inkSoft">{p.status}</td>
                  {isAdmin && <td className="px-4 py-3 text-right">{fmtMoney(p.estBudget)}</td>}
                  <td className="px-4 py-3 text-right font-mono">
                    {p.todos.filter((t) => !t.done).length}
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-10 text-center text-brand-inkFaint">
                    No projects yet.{" "}
                    {isAdmin && (
                      <Link href="/projects/new" className="text-brand-greenDark font-semibold">
                        Create one →
                      </Link>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
