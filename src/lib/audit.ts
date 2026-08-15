import { prisma } from "./prisma";
import { headers } from "next/headers";

/**
 * Append-only audit trail.
 *
 * Three deliberate design choices:
 *
 * 1. There is no update or delete function here, and none anywhere else in the
 *    codebase. An audit log that can be edited isn't evidence.
 * 2. Actor name and entity label are denormalised. A log that reads "user
 *    a7f3b… changed project c9d2e…" is useless a year later, and joins break
 *    once someone leaves the company.
 * 3. Nothing here throws. Failing to record a change must never prevent the
 *    change — an unlogged edit is bad, a broken save is worse.
 */

export type FieldChange = { field: string; from: unknown; to: unknown };

/** Fields whose movement should be flagged for financial review. */
const FINANCIAL_FIELDS = new Set([
  "estBudget", "committed", "actualSpend", "amount", "unitCost", "budgetAmount",
  "actualAmount", "q1Proj", "q2Proj", "q3Proj", "q4Proj", "estimatedCost", "value",
]);

/** Never written to the log, even if they appear in a diff. */
const REDACTED = new Set(["passwordHash", "inviteToken", "inviteTokenExpires"]);

const LABELS: Record<string, string> = {
  estBudget: "Budget",
  committed: "Committed",
  actualSpend: "Actual spend",
  completionPct: "Completion",
  status: "Status",
  priority: "Priority",
  title: "Title",
  amount: "Amount",
  unitCost: "Unit cost",
  leadId: "Lead",
  ownerId: "Owner",
  role: "Role",
  category: "Category",
};

function fmt(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") {
    if (FINANCIAL_FIELDS.has(field)) return `$${v.toLocaleString("en-US")}`;
    if (field === "completionPct") return `${v}%`;
    return String(v);
  }
  if (v instanceof Date) return v.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const s = String(v);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

/**
 * Compares two records and returns only what actually changed. Values that are
 * equal, or fields we never log, are dropped so the trail stays readable.
 */
export function diffRecords(
  before: Record<string, any>,
  after: Record<string, any>,
  only?: string[]
): FieldChange[] {
  const keys = only ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const out: FieldChange[] = [];
  for (const k of keys) {
    if (REDACTED.has(k)) continue;
    const a = before?.[k];
    const b = after?.[k];
    if (a instanceof Date || b instanceof Date) {
      if (new Date(a ?? 0).getTime() !== new Date(b ?? 0).getTime()) out.push({ field: k, from: a, to: b });
      continue;
    }
    if (typeof a === "object" || typeof b === "object") continue; // relations handled separately
    if (a !== b && !(a == null && b == null)) out.push({ field: k, from: a, to: b });
  }
  return out;
}

export async function recordAudit(opts: {
  entityType: string;
  entityId: string;
  entityLabel: string;
  action: string;
  actor: { id?: string; name: string; email?: string };
  changes?: FieldChange[];
  summary?: string;
}): Promise<void> {
  try {
    const changes = (opts.changes ?? []).filter((c) => !REDACTED.has(c.field));

    // Build a readable sentence, since that's what anyone reviewing the log
    // actually reads — the JSON is for reconstruction, not reading.
    let summary = opts.summary ?? "";
    if (!summary) {
      if (changes.length === 0) {
        summary = `${opts.action.toLowerCase()} ${opts.entityLabel}`;
      } else if (changes.length <= 3) {
        summary = changes
          .map((c) => `${LABELS[c.field] ?? c.field} ${fmt(c.field, c.from)} → ${fmt(c.field, c.to)}`)
          .join(", ");
      } else {
        summary = `${changes.length} fields changed: ${changes.map((c) => LABELS[c.field] ?? c.field).slice(0, 4).join(", ")}…`;
      }
    }

    const isFinancial =
      changes.some((c) => FINANCIAL_FIELDS.has(c.field)) ||
      ["PurchaseRequest", "FinancialLineItem"].includes(opts.entityType);

    let ip: string | undefined;
    try {
      const h = await headers();
      ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
    } catch {
      // Outside a request context (cron, script) — not an error.
    }

    await prisma.auditLog.create({
      data: {
        entityType: opts.entityType,
        entityId: opts.entityId,
        entityLabel: opts.entityLabel.slice(0, 200),
        action: opts.action,
        changes: changes.length ? JSON.stringify(changes) : null,
        summary: summary.slice(0, 500),
        isFinancial,
        actorId: opts.actor.id ?? null,
        actorName: opts.actor.name,
        actorEmail: opts.actor.email ?? null,
        ipAddress: ip ?? null,
      },
    });
  } catch (e) {
    // Never break the caller. An unlogged change is bad; a failed save is worse.
    console.error("[audit] failed to record:", e);
  }
}

/** Convenience for the common "compare before and after" case. */
export async function auditUpdate(opts: {
  entityType: string;
  entityId: string;
  entityLabel: string;
  actor: { id?: string; name: string; email?: string };
  before: Record<string, any>;
  after: Record<string, any>;
  only?: string[];
}): Promise<void> {
  const changes = diffRecords(opts.before, opts.after, opts.only);
  if (changes.length === 0) return; // nothing moved, nothing to log
  await recordAudit({ ...opts, action: "UPDATE", changes });
}
