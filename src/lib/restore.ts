import { prisma } from "./prisma";

/**
 * Restoring a backup.
 *
 * The design principle: a restore that silently overwrites live data is more
 * dangerous than having no restore at all. So this is deliberately two-phase —
 * inspect first, apply only after an explicit, typed confirmation.
 *
 * Restore is ADDITIVE and NON-DESTRUCTIVE. Records missing from the live
 * database are recreated; records that already exist are left alone. Nothing
 * is ever deleted. If you need to roll back a bad change to an existing
 * record, that's what the audit log is for — a blind overwrite would discard
 * everything that happened since the backup was taken.
 */

/** Tables restored, in dependency order so foreign keys resolve. */
const RESTORE_ORDER = [
  "teamMembers",
  "roles",
  "categories",
  "projects",
  "projectMembers",
  "talkingPoints",
  "keyDates",
  "todos",
  "openQuestions",
  "projectFiles",
  "financialLineItems",
  "projectRebates",
  "projectAccess",
  "tradeShows",
  "meetings",
  "resourceCategories",
  "resources",
  "purchaseRequests",
] as const;

const MODEL_FOR: Record<string, string> = {
  teamMembers: "teamMember",
  roles: "role",
  categories: "category",
  projects: "project",
  projectMembers: "projectMember",
  talkingPoints: "talkingPoint",
  keyDates: "keyDate",
  todos: "todo",
  openQuestions: "openQuestion",
  projectFiles: "projectFile",
  financialLineItems: "financialLineItem",
  projectRebates: "projectRebate",
  projectAccess: "projectAccess",
  tradeShows: "tradeShow",
  meetings: "meeting",
  resourceCategories: "resourceCategory",
  resources: "resource",
  purchaseRequests: "purchaseRequest",
};

/** Never restored — credentials must be re-established, never replayed. */
const STRIP_FIELDS = ["passwordHash", "inviteToken", "inviteTokenExpires"];

export type RestorePlan = {
  valid: boolean;
  error?: string;
  backupDate?: string;
  tables: {
    table: string;
    inBackup: number;
    alreadyPresent: number;
    wouldCreate: number;
  }[];
  totalWouldCreate: number;
  warnings: string[];
};

function unwrap(parsed: any): Record<string, any[]> | null {
  // The export writes { exportedAt, data: {...} }; tolerate a bare object too.
  if (parsed?.data && typeof parsed.data === "object") return parsed.data;
  if (parsed && typeof parsed === "object") return parsed;
  return null;
}

/**
 * Reads a backup and reports exactly what a restore would do. Changes nothing.
 */
export async function planRestore(json: string): Promise<RestorePlan> {
  const empty: RestorePlan = { valid: false, tables: [], totalWouldCreate: 0, warnings: [] };

  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ...empty, error: "That file isn't valid JSON. Use a backup downloaded from Settings." };
  }

  const data = unwrap(parsed);
  if (!data) return { ...empty, error: "This doesn't look like a Z1Power backup file." };

  const known = RESTORE_ORDER.filter((t) => Array.isArray(data[t]));
  if (known.length === 0) {
    return { ...empty, error: "No recognisable tables found in this file." };
  }

  const warnings: string[] = [];
  const tables: RestorePlan["tables"] = [];
  let totalWouldCreate = 0;

  for (const table of RESTORE_ORDER) {
    const rows = data[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const model = (prisma as any)[MODEL_FOR[table]];
    if (!model) continue;

    const ids = rows.map((r: any) => r?.id).filter(Boolean);
    const existing = ids.length
      ? await model.findMany({ where: { id: { in: ids } }, select: { id: true } })
      : [];
    const present = existing.length;
    const wouldCreate = rows.length - present;

    tables.push({ table, inBackup: rows.length, alreadyPresent: present, wouldCreate });
    totalWouldCreate += wouldCreate;
  }

  // Surface anything in the file we won't touch, so nobody assumes it restored.
  const unknownKeys = Object.keys(data).filter(
    (k) => Array.isArray(data[k]) && !RESTORE_ORDER.includes(k as any)
  );
  if (unknownKeys.length) {
    warnings.push(`Not restored (unsupported in this version): ${unknownKeys.join(", ")}`);
  }
  if (totalWouldCreate === 0) {
    warnings.push("Every record in this backup already exists — a restore would change nothing.");
  }
  warnings.push("Restore only adds missing records. Existing records are never overwritten or deleted.");
  warnings.push("Passwords and invite tokens are never restored — those must be re-issued.");

  return {
    valid: true,
    backupDate: typeof parsed?.exportedAt === "string" ? parsed.exportedAt : undefined,
    tables,
    totalWouldCreate,
    warnings,
  };
}

export type RestoreResult = {
  created: { table: string; count: number }[];
  totalCreated: number;
  skipped: number;
  errors: string[];
};

/**
 * Applies the restore. Only ever creates records that are absent.
 *
 * Deliberately not wrapped in one giant transaction: with thousands of rows a
 * single failure would roll back everything and leave you with nothing
 * restored. Instead each row is independent, failures are collected and
 * reported, and re-running is safe because existing rows are skipped.
 */
export async function applyRestore(json: string): Promise<RestoreResult> {
  const parsed = JSON.parse(json);
  const data = unwrap(parsed)!;
  const created: { table: string; count: number }[] = [];
  const errors: string[] = [];
  let totalCreated = 0;
  let skipped = 0;

  for (const table of RESTORE_ORDER) {
    const rows = data[table];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const model = (prisma as any)[MODEL_FOR[table]];
    if (!model) continue;

    let count = 0;
    for (const row of rows) {
      if (!row?.id) continue;
      try {
        const exists = await model.findUnique({ where: { id: row.id }, select: { id: true } });
        if (exists) {
          skipped++;
          continue;
        }
        const clean: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) {
          if (STRIP_FIELDS.includes(k)) continue;
          // Drop nested relation objects — only scalar columns are restored.
          if (v !== null && typeof v === "object" && !(v instanceof Date) && !isIsoDate(v)) continue;
          clean[k] = isIsoDate(v) ? new Date(v as string) : v;
        }
        await model.create({ data: clean });
        count++;
        totalCreated++;
      } catch (e: any) {
        // Usually a foreign key pointing at something that no longer exists —
        // report it rather than aborting the whole restore.
        errors.push(`${table} ${row.id}: ${(e?.message ?? "unknown").split("\n")[0].slice(0, 120)}`);
      }
    }
    if (count > 0) created.push({ table, count });
  }

  return { created, totalCreated, skipped, errors: errors.slice(0, 50) };
}

function isIsoDate(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v);
}
