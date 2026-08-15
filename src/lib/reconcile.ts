import { prisma } from "./prisma";
import { recordAudit } from "./audit";

/**
 * Project.committed and actualSpend are denormalised totals — fast to read on
 * the dashboard, but they can drift from the line items they're supposed to
 * summarise. Drift happens through interrupted writes, manual ledger edits, or
 * a cancelled purchase whose cleanup half-completed.
 *
 * Rather than deriving the totals on every read (slow across 23 projects), we
 * keep them stored and reconcile: recompute from source, compare, report.
 *
 * Detection and repair are deliberately separate. Silently "fixing" financial
 * figures is how a real discrepancy gets papered over — someone should see
 * what moved and why before it's corrected.
 */

/** Line-item statuses that represent money committed. */
const COMMITTED_STATUSES = ["Committed", "Invoiced", "Paid"];
/** Statuses where money has actually been spent. */
const SPENT_STATUSES = ["Invoiced", "Paid"];

export type Discrepancy = {
  projectId: string;
  projectTitle: string;
  storedCommitted: number;
  computedCommitted: number;
  committedDiff: number;
  storedActual: number;
  computedActual: number;
  actualDiff: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Floating-point tolerance — a cent of rounding isn't drift. */
const TOLERANCE = 0.01;

/** Recomputes totals from line items. Read-only; changes nothing. */
export async function findDiscrepancies(): Promise<Discrepancy[]> {
  const projects = await prisma.project.findMany({
    where: { archived: false },
    select: {
      id: true,
      title: true,
      committed: true,
      actualSpend: true,
      lineItems: { select: { budgetAmount: true, actualAmount: true, status: true } },
    },
  });

  const out: Discrepancy[] = [];
  for (const p of projects) {
    const computedCommitted = round2(
      p.lineItems
        .filter((l) => COMMITTED_STATUSES.includes(l.status))
        .reduce((n, l) => n + (l.budgetAmount || 0), 0)
    );
    const computedActual = round2(
      p.lineItems
        .filter((l) => SPENT_STATUSES.includes(l.status))
        .reduce((n, l) => n + (l.actualAmount || 0), 0)
    );

    const committedDiff = round2((p.committed || 0) - computedCommitted);
    const actualDiff = round2((p.actualSpend || 0) - computedActual);

    if (Math.abs(committedDiff) > TOLERANCE || Math.abs(actualDiff) > TOLERANCE) {
      out.push({
        projectId: p.id,
        projectTitle: p.title,
        storedCommitted: round2(p.committed || 0),
        computedCommitted,
        committedDiff,
        storedActual: round2(p.actualSpend || 0),
        computedActual,
        actualDiff,
      });
    }
  }
  return out;
}

/**
 * Runs a check and optionally repairs. Every repair is written to the audit
 * log as a financial change, so a corrected figure is never silent.
 */
export async function reconcile(opts: {
  actor: { id?: string; name: string; email?: string };
  repair: boolean;
}): Promise<{ checked: number; drift: Discrepancy[]; repaired: number; runId: string }> {
  const total = await prisma.project.count({ where: { archived: false } });
  const drift = await findDiscrepancies();
  let repaired = 0;

  if (opts.repair) {
    for (const d of drift) {
      await prisma.project.update({
        where: { id: d.projectId },
        data: { committed: d.computedCommitted, actualSpend: d.computedActual },
      });
      repaired++;

      await recordAudit({
        entityType: "Project",
        entityId: d.projectId,
        entityLabel: d.projectTitle,
        action: "RECONCILE",
        actor: opts.actor,
        changes: [
          ...(Math.abs(d.committedDiff) > TOLERANCE
            ? [{ field: "committed", from: d.storedCommitted, to: d.computedCommitted }]
            : []),
          ...(Math.abs(d.actualDiff) > TOLERANCE
            ? [{ field: "actualSpend", from: d.storedActual, to: d.computedActual }]
            : []),
        ],
        summary: `Reconciled against line items — corrected drift of $${Math.abs(d.committedDiff).toLocaleString("en-US")}`,
      });
    }
  }

  const run = await prisma.reconciliationRun.create({
    data: {
      runBy: opts.actor.id ?? null,
      runByName: opts.actor.name,
      projectsChecked: total,
      driftFound: drift.length,
      driftRepaired: repaired,
      details: drift.length ? JSON.stringify(drift) : null,
    },
  });

  return { checked: total, drift, repaired, runId: run.id };
}
