import Link from "next/link";
import { prisma } from "@/lib/prisma";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Portfolio-level financial position. Deliberately leads with what's wrong —
 * over-budget projects and pending spend — rather than a total, because the
 * total isn't actionable and the exceptions are.
 */
export default async function PortfolioRollup({ projectIds }: { projectIds: string[] }) {
  const [projects, pendingPurchases] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds }, archived: false },
      select: { id: true, title: true, code: true, estBudget: true, committed: true, actualSpend: true, status: true, completionPct: true },
      orderBy: { estBudget: "desc" },
    }),
    prisma.purchaseRequest.findMany({
      where: { status: "SUBMITTED" },
      select: { amount: true },
    }),
  ]);

  const withBudget = projects.filter((p) => p.estBudget > 0);
  const totalBudget = withBudget.reduce((n, p) => n + p.estBudget, 0);
  const totalCommitted = projects.reduce((n, p) => n + p.committed, 0);
  const totalSpent = projects.reduce((n, p) => n + p.actualSpend, 0);
  const pendingTotal = pendingPurchases.reduce((n, p) => n + p.amount, 0);

  // The exceptions worth surfacing.
  const overBudget = withBudget.filter((p) => p.committed > p.estBudget);
  const nearLimit = withBudget.filter((p) => p.committed <= p.estBudget && p.committed / p.estBudget >= 0.9);
  // Spending faster than the work is progressing — an early warning, not proof.
  const burnRisk = withBudget.filter((p) => {
    if (p.completionPct <= 0 || p.estBudget <= 0) return false;
    const spentPct = (p.actualSpend / p.estBudget) * 100;
    return spentPct > p.completionPct + 20;
  });

  if (withBudget.length === 0) {
    return (
      <div className="bg-white border border-brand-line rounded-md p-5">
        <p className="kicker mb-1">Portfolio</p>
        <p className="text-sm text-brand-inkFaint">No budgets set yet, so there&rsquo;s nothing to roll up.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-brand-line rounded-md">
      <div className="px-4 py-3 border-b border-brand-line">
        <p className="kicker">Portfolio</p>
        <p className="text-[10px] text-brand-inkFaint">{withBudget.length} projects with budgets set</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-brand-line border-b border-brand-line">
        <Cell label="Total budget" value={money(totalBudget)} />
        <Cell
          label="Committed"
          value={money(totalCommitted)}
          sub={totalBudget > 0 ? `${Math.round((totalCommitted / totalBudget) * 100)}% of budget` : undefined}
          color={totalCommitted > totalBudget ? "#C0392B" : undefined}
        />
        <Cell label="Spent" value={money(totalSpent)} />
        <Cell
          label="Awaiting approval"
          value={money(pendingTotal)}
          color={pendingTotal > 0 ? "#E8743B" : undefined}
        />
      </div>

      {(overBudget.length > 0 || nearLimit.length > 0 || burnRisk.length > 0) && (
        <div className="p-4 space-y-3">
          {overBudget.length > 0 && (
            <Section title={`Over budget (${overBudget.length})`} color="#C0392B">
              {overBudget.map((p) => (
                <Row
                  key={p.id}
                  id={p.id}
                  code={p.code}
                  title={p.title}
                  right={`${money(p.committed)} of ${money(p.estBudget)}`}
                  note={`over by ${money(p.committed - p.estBudget)}`}
                  color="#C0392B"
                />
              ))}
            </Section>
          )}

          {nearLimit.length > 0 && (
            <Section title={`Near limit (${nearLimit.length})`} color="#E8743B">
              {nearLimit.map((p) => (
                <Row
                  key={p.id}
                  id={p.id}
                  code={p.code}
                  title={p.title}
                  right={`${Math.round((p.committed / p.estBudget) * 100)}% committed`}
                  note={`${money(p.estBudget - p.committed)} left`}
                  color="#E8743B"
                />
              ))}
            </Section>
          )}

          {burnRisk.length > 0 && (
            <Section title={`Spending ahead of progress (${burnRisk.length})`} color="#8B5A2B">
              {burnRisk.map((p) => (
                <Row
                  key={p.id}
                  id={p.id}
                  code={p.code}
                  title={p.title}
                  right={`${Math.round((p.actualSpend / p.estBudget) * 100)}% spent`}
                  note={`${p.completionPct}% complete`}
                  color="#8B5A2B"
                />
              ))}
            </Section>
          )}
        </div>
      )}

      {overBudget.length === 0 && nearLimit.length === 0 && burnRisk.length === 0 && (
        <p className="p-4 text-sm text-brand-inkSoft">Every project with a budget is within it.</p>
      )}
    </div>
  );
}

function Cell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="px-3 py-2.5">
      <p className="font-mono text-[8px] font-bold tracking-widest text-brand-greenDark uppercase">{label}</p>
      <p className="font-heading text-[17px] font-extrabold leading-tight" style={{ color: color ?? "#1C1C1C" }}>{value}</p>
      {sub && <p className="text-[9px] text-brand-inkFaint">{sub}</p>}
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-mono font-bold tracking-widest mb-1.5" style={{ color }}>{title.toUpperCase()}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ id, code, title, right, note, color }: {
  id: string; code: string | null; title: string; right: string; note: string; color: string;
}) {
  return (
    <Link href={`/projects/${id}`} className="flex items-center justify-between gap-2 text-xs hover:bg-brand-greenTint/40 rounded px-1.5 py-1 -mx-1.5">
      <span className="min-w-0 truncate">
        {code && <span className="font-mono text-[9px] text-brand-inkFaint mr-1.5">{code}</span>}
        <span className="text-brand-ink">{title}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="text-brand-inkSoft">{right}</span>
        <span className="ml-1.5 font-semibold" style={{ color }}>{note}</span>
      </span>
    </Link>
  );
}
