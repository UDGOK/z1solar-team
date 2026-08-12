import { prisma } from "./prisma";
import type { CurrentMember } from "./auth";

export type ActivityAction =
  | "project.created"
  | "project.updated"
  | "project.status_changed"
  | "task.created"
  | "task.updated"
  | "task.assigned"
  | "task.completed"
  | "task.reopened"
  | "task.deleted"
  | "file.uploaded"
  | "file.deleted"
  | "financials.updated"
  | "rebate.updated"
  | "site.updated"
  | "access.changed"
  | "member.added"
  | "report.subscription_changed";

/**
 * Append an activity record.
 *
 * Deliberately never throws: an audit-log failure must not roll back or break
 * the user action that triggered it. A missing log line is a far smaller
 * problem than a failed save.
 */
export async function logActivity(opts: {
  projectId?: string | null;
  actor: CurrentMember | { id: string; name: string };
  action: ActivityAction;
  summary: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        projectId: opts.projectId ?? null,
        actorId: opts.actor.id,
        actorName: opts.actor.name,
        action: opts.action,
        summary: opts.summary.slice(0, 500),
        meta: opts.meta ? JSON.stringify(opts.meta).slice(0, 4000) : null,
      },
    });
  } catch (e) {
    console.error("[activity] log failed:", e);
  }
}

/** Compares two records and describes what changed, for readable log lines. */
export function describeChanges(
  before: Record<string, any>,
  after: Record<string, any>,
  labels: Record<string, string>
): { summary: string; changes: Record<string, { from: any; to: any }> } {
  const changes: Record<string, { from: any; to: any }> = {};
  for (const key of Object.keys(labels)) {
    const b = before[key];
    const a = after[key];
    // Loose compare handles Date vs string and number vs numeric-string.
    const same = b instanceof Date && a instanceof Date ? b.getTime() === a.getTime() : String(b ?? "") === String(a ?? "");
    if (!same) changes[key] = { from: b ?? null, to: a ?? null };
  }
  const keys = Object.keys(changes);
  if (keys.length === 0) return { summary: "", changes };
  const parts = keys.slice(0, 3).map((k) => labels[k]);
  const extra = keys.length > 3 ? ` and ${keys.length - 3} more` : "";
  return { summary: `${parts.join(", ")}${extra}`, changes };
}

const ICONS: Record<string, string> = {
  "project.created": "🆕",
  "project.updated": "✏️",
  "project.status_changed": "🚦",
  "task.created": "➕",
  "task.updated": "✏️",
  "task.assigned": "👤",
  "task.completed": "✅",
  "task.reopened": "↩️",
  "task.deleted": "🗑️",
  "file.uploaded": "📎",
  "file.deleted": "🗑️",
  "financials.updated": "💵",
  "rebate.updated": "🏷️",
  "site.updated": "📍",
  "access.changed": "🔐",
  "member.added": "👥",
  "report.subscription_changed": "📧",
};

export function activityIcon(action: string): string {
  return ICONS[action] || "•";
}
