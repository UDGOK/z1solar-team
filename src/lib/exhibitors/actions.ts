"use server";

/**
 * Server actions for trade show exhibitors, vendors and vendor tags.
 *
 * Kept in its own file rather than appended to src/lib/actions.ts, which is
 * already 3,500 lines and holds every server action in the app. Splitting by
 * domain was on the project's own list of things to fix; new work may as well
 * land on the right side of that line.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "../prisma";
import { getCurrentMember } from "../auth";
import { logActivity } from "../activity";
import { getExhibitorAccess } from "./access";
import {
  cleanCompanyName,
  matchKey,
  tidyDisplayName,
  findVendorMatch,
  findInternalDuplicates,
  type VendorCandidate,
} from "../vendors/match";
import { normaliseUrl, type FieldKey, type RawRow, applyColumnMap, guessColumnMap, looksLikeHeaderRow } from "../importers/columnMap";
import { parseExhibitorText } from "../importers/textRules";
import { DEFAULT_TAGS, MEETING_STATUSES, type MeetingStatus } from "./constants";
import {
  stageImportCore, applyImportCore, linkVendorTags,
  type StageInput, type ApplyResult,
} from "./importCore";

export type { ApplyResult };


async function requireMember() {
  const me = await getCurrentMember();
  if (!me) redirect("/login");
  return me!;
}

/** Throws unless the caller may annotate this show. */
async function requireAnnotate(tradeShowId: string) {
  const me = await requireMember();
  const access = await getExhibitorAccess(me, tradeShowId);
  if (!access.canAnnotate) throw new Error("You don't have access to this show's exhibitor list.");
  return { me, access };
}

/** Throws unless the caller may manage (import, edit companies, delete). */
async function requireManage(tradeShowId: string) {
  const me = await requireMember();
  const access = await getExhibitorAccess(me, tradeShowId);
  if (!access.canManage) throw new Error("Only trade show managers can do that.");
  return { me, access };
}

function refresh(tradeShowId: string) {
  revalidatePath(`/trade-shows/${tradeShowId}/exhibitors`);
  revalidatePath("/trade-shows");
}

// ---------------------------------------------------------------------------
// Vendor tags
// ---------------------------------------------------------------------------



const slugify = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function ensureDefaultTags() {
  const count = await prisma.vendorTag.count();
  if (count > 0) return;
  await prisma.vendorTag.createMany({
    // Safe without a duplicate guard: this only runs when the table is empty.
    data: DEFAULT_TAGS.map((name, i) => ({ name, slug: slugify(name), sortOrder: i })),
  });
}

export async function createVendorTag(name: string) {
  const me = await requireMember();
  const record = await prisma.teamMember.findUnique({
    where: { id: me.id },
    select: { canManageTradeShows: true },
  });
  if (me.role !== "ADMIN" && !record?.canManageTradeShows) {
    throw new Error("Only trade show managers can manage tags.");
  }

  const clean = String(name || "").trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Tag name is required.");
  if (clean.length > 40) throw new Error("Tag names are limited to 40 characters.");

  const existing = await prisma.vendorTag.findUnique({ where: { slug: slugify(clean) } });
  // Case-insensitive collision: "BESS" and "bess" are the same tag, and letting
  // both exist means filtering silently misses half the vendors.
  if (existing) throw new Error(`A tag called "${existing.name}" already exists.`);

  const max = await prisma.vendorTag.aggregate({ _max: { sortOrder: true } });
  const tag = await prisma.vendorTag.create({
    data: { name: clean, slug: slugify(clean), sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  revalidatePath("/settings");
  return tag.id;
}

export async function renameVendorTag(id: string, name: string) {
  const me = await requireMember();
  const record = await prisma.teamMember.findUnique({
    where: { id: me.id },
    select: { canManageTradeShows: true },
  });
  if (me.role !== "ADMIN" && !record?.canManageTradeShows) {
    throw new Error("Only trade show managers can manage tags.");
  }

  const clean = String(name || "").trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Tag name is required.");

  const clash = await prisma.vendorTag.findUnique({ where: { slug: slugify(clean) } });
  if (clash && clash.id !== id) throw new Error(`A tag called "${clash.name}" already exists.`);

  // Renaming is a single update because tags are a table, not a string column —
  // every vendor carrying the tag follows automatically. This is exactly why
  // the project's category rename was rebuilt the same way.
  await prisma.vendorTag.update({
    where: { id },
    data: { name: clean, slug: slugify(clean) },
  });
  revalidatePath("/settings");
}

/**
 * Deletes a tag. Refuses while vendors still carry it unless a replacement is
 * given — mirrors the reassign-before-delete rule already used for project
 * categories, so nothing is silently untagged.
 */
export async function deleteVendorTag(id: string, reassignToId?: string | null) {
  const me = await requireMember();
  const record = await prisma.teamMember.findUnique({
    where: { id: me.id },
    select: { canManageTradeShows: true },
  });
  if (me.role !== "ADMIN" && !record?.canManageTradeShows) {
    throw new Error("Only trade show managers can manage tags.");
  }

  const inUse = await prisma.vendorTagLink.count({ where: { tagId: id } });
  if (inUse > 0 && !reassignToId) {
    const tag = await prisma.vendorTag.findUnique({ where: { id }, select: { name: true } });
    throw new Error(
      `"${tag?.name ?? "That tag"}" is on ${inUse} ${inUse === 1 ? "vendor" : "vendors"}. Choose a tag to move them to first.`
    );
  }

  await prisma.$transaction(async (tx) => {
    if (inUse > 0 && reassignToId) {
      const links = await tx.vendorTagLink.findMany({ where: { tagId: id }, select: { vendorId: true } });
      // A vendor may already carry the destination tag, and the composite
      // primary key would make a blind insert fail the whole reassignment —
      // so the ones that already have it are filtered out first.
      const already = await tx.vendorTagLink.findMany({
        where: { tagId: reassignToId, vendorId: { in: links.map((l) => l.vendorId) } },
        select: { vendorId: true },
      });
      const have = new Set(already.map((a) => a.vendorId));
      const toAdd = links.filter((l) => !have.has(l.vendorId));
      if (toAdd.length > 0) {
        await tx.vendorTagLink.createMany({
          data: toAdd.map((l) => ({ vendorId: l.vendorId, tagId: reassignToId })),
        });
      }
    }
    await tx.vendorTagLink.deleteMany({ where: { tagId: id } });
    await tx.vendorTag.delete({ where: { id } });
  });

  revalidatePath("/settings");
}

export async function reorderVendorTags(idsInOrder: string[]) {
  const me = await requireMember();
  if (me.role !== "ADMIN") {
    const record = await prisma.teamMember.findUnique({
      where: { id: me.id },
      select: { canManageTradeShows: true },
    });
    if (!record?.canManageTradeShows) throw new Error("Only trade show managers can manage tags.");
  }
  await prisma.$transaction(
    idsInOrder.map((id, i) => prisma.vendorTag.update({ where: { id }, data: { sortOrder: i } }))
  );
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// Exhibitor row edits
// ---------------------------------------------------------------------------

export type ExhibitorPatch = {
  booth?: string | null;
  hall?: string | null;
  meetingWanted?: boolean;
  meetingStatus?: string;
  priority?: string;
  ownerId?: string | null;
  notes?: string | null;
  outcome?: string | null;
  projectIds?: string[];
};

export async function updateExhibitor(exhibitorId: string, patch: ExhibitorPatch) {
  const row = await prisma.tradeShowExhibitor.findUnique({
    where: { id: exhibitorId },
    select: { tradeShowId: true, vendor: { select: { name: true } }, meetingWanted: true },
  });
  if (!row) throw new Error("That exhibitor no longer exists.");
  const { me } = await requireAnnotate(row.tradeShowId);

  if (patch.meetingStatus && !MEETING_STATUSES.includes(patch.meetingStatus as MeetingStatus)) {
    throw new Error("Unknown meeting status.");
  }

  const data: Record<string, unknown> = {};
  if (patch.booth !== undefined) data.booth = patch.booth?.trim() || null;
  if (patch.hall !== undefined) data.hall = patch.hall?.trim() || null;
  if (patch.meetingWanted !== undefined) data.meetingWanted = patch.meetingWanted;
  if (patch.meetingStatus !== undefined) data.meetingStatus = patch.meetingStatus;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.ownerId !== undefined) data.ownerId = patch.ownerId || null;
  if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null;
  if (patch.outcome !== undefined) data.outcome = patch.outcome?.trim() || null;

  // Marking a meeting as wanted with no status yet should not leave it looking
  // like it's already been handled.
  if (patch.meetingWanted === true && patch.meetingStatus === undefined) {
    data.meetingStatus = "To arrange";
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.tradeShowExhibitor.update({ where: { id: exhibitorId }, data });
    }
    if (patch.projectIds) {
      await tx.tradeShowExhibitorProject.deleteMany({ where: { exhibitorId } });
      if (patch.projectIds.length > 0) {
        // Rows were just deleted above, so the only possible collision is a
        // repeated id inside the incoming array.
        await tx.tradeShowExhibitorProject.createMany({
          data: Array.from(new Set(patch.projectIds)).map((projectId) => ({ exhibitorId, projectId })),
        });
      }
    }
  });

  if (patch.meetingWanted !== undefined && patch.meetingWanted !== row.meetingWanted) {
    await logActivity({
      actor: me,
      action: "task.updated",
      summary: patch.meetingWanted
        ? `Flagged ${row.vendor.name} for a meeting`
        : `Un-flagged ${row.vendor.name}`,
      meta: { exhibitorId, tradeShowId: row.tradeShowId },
    });
  }

  refresh(row.tradeShowId);
}

/** Appends a note. Append-only so two people at the same booth can't overwrite each other. */
export async function addExhibitorNote(exhibitorId: string, body: string) {
  const row = await prisma.tradeShowExhibitor.findUnique({
    where: { id: exhibitorId },
    select: { tradeShowId: true },
  });
  if (!row) throw new Error("That exhibitor no longer exists.");
  const { me } = await requireAnnotate(row.tradeShowId);

  const text = String(body || "").trim();
  if (!text) throw new Error("Write something first.");

  await prisma.exhibitorNote.create({
    data: {
      exhibitorId,
      authorId: me.id,
      // Denormalised so a note still reads correctly if the author is later
      // removed from the team.
      authorName: me.name,
      body: text.slice(0, 4000),
    },
  });
  refresh(row.tradeShowId);
}

export async function deleteExhibitor(exhibitorId: string) {
  const row = await prisma.tradeShowExhibitor.findUnique({
    where: { id: exhibitorId },
    select: { tradeShowId: true },
  });
  if (!row) return;
  await requireManage(row.tradeShowId);
  // Removes the appearance only. The Vendor survives with its history intact,
  // which is the whole point of keeping companies global.
  await prisma.tradeShowExhibitor.delete({ where: { id: exhibitorId } });
  refresh(row.tradeShowId);
}

// ---------------------------------------------------------------------------
// Vendor (company) edits — shared across every show
// ---------------------------------------------------------------------------

export type VendorPatch = {
  name?: string;
  description?: string | null;
  websiteUrl?: string | null;
  hqCity?: string | null;
  hqCountry?: string | null;
  notes?: string | null;
  tagIds?: string[];
};

export async function updateVendor(vendorId: string, patch: VendorPatch, fromTradeShowId?: string) {
  const me = await requireMember();
  const isAdmin = me.role === "ADMIN";
  const record = await prisma.teamMember.findUnique({
    where: { id: me.id },
    select: { canManageTradeShows: true, canViewTradeShows: true },
  });
  if (!isAdmin && !record?.canManageTradeShows) {
    throw new Error("Only trade show managers can edit company records.");
  }

  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const clean = cleanCompanyName(patch.name);
    if (!clean) throw new Error("Company name is required.");
    data.name = clean;
    // matchKey must be recomputed on every rename or duplicate detection
    // quietly starts comparing against a stale key.
    data.matchKey = matchKey(clean);
  }
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.websiteUrl !== undefined) data.websiteUrl = normaliseUrl(patch.websiteUrl ?? undefined) ?? null;
  if (patch.hqCity !== undefined) data.hqCity = patch.hqCity?.trim() || null;
  if (patch.hqCountry !== undefined) data.hqCountry = patch.hqCountry?.trim() || null;
  if (patch.notes !== undefined) data.notes = patch.notes?.trim() || null;

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.vendor.update({ where: { id: vendorId }, data });
    }
    if (patch.tagIds) {
      await tx.vendorTagLink.deleteMany({ where: { vendorId } });
      if (patch.tagIds.length > 0) {
        await tx.vendorTagLink.createMany({
          data: Array.from(new Set(patch.tagIds)).map((tagId) => ({ vendorId, tagId })),
        });
      }
    }
  });

  if (fromTradeShowId) refresh(fromTradeShowId);
  revalidatePath("/trade-shows");
}

/**
 * Adds one company to a show by hand.
 * Returns the exhibitor id, plus any duplicate we spotted so the UI can say so
 * rather than quietly creating a second Sungrow.
 */
export async function addExhibitorManually(
  tradeShowId: string,
  input: { name: string; booth?: string; description?: string; websiteUrl?: string; tagIds?: string[] }
) {
  const { me } = await requireManage(tradeShowId);

  const name = cleanCompanyName(input.name);
  if (!name) throw new Error("Company name is required.");
  const key = matchKey(name);

  const candidates = await prisma.vendor.findMany({
    where: { matchKey: key },
    select: { id: true, name: true, matchKey: true },
  });

  let vendorId = candidates[0]?.id;
  if (!vendorId) {
    const created = await prisma.vendor.create({
      data: {
        name,
        matchKey: key,
        description: input.description?.trim() || null,
        websiteUrl: normaliseUrl(input.websiteUrl) ?? null,
        createdById: me.id,
      },
    });
    vendorId = created.id;
    if (input.tagIds?.length) {
      await linkVendorTags(prisma, created.id, input.tagIds);
    }
  }

  const existing = await prisma.tradeShowExhibitor.findUnique({
    where: { tradeShowId_vendorId: { tradeShowId, vendorId } },
    select: { id: true },
  });
  if (existing) {
    refresh(tradeShowId);
    return { exhibitorId: existing.id, alreadyPresent: true };
  }

  const row = await prisma.tradeShowExhibitor.create({
    data: { tradeShowId, vendorId, booth: input.booth?.trim() || null },
  });
  refresh(tradeShowId);
  return { exhibitorId: row.id, alreadyPresent: false };
}

// ---------------------------------------------------------------------------
// Import — parse into staging, review, then apply
// ---------------------------------------------------------------------------

/**
 * Turns already-parsed rows into a DRAFT import with duplicate suggestions
 * attached. Nothing touches Vendor or TradeShowExhibitor here — that only
 * happens in applyImport, after a human has looked.
 */
export async function stageImport(tradeShowId: string, opts: StageInput) {
  const { me } = await requireManage(tradeShowId);
  return stageImportCore(prisma, tradeShowId, me, opts);
}


/** Parses pasted text or PDF-extracted text and stages it. */
export async function stageImportFromText(
  tradeShowId: string,
  text: string,
  source: "PASTE" | "PDF",
  fileName?: string
) {
  await requireManage(tradeShowId);
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("There's no text to read.");

  const { rows, skipped } = parseExhibitorText(trimmed);
  if (rows.length === 0) {
    throw new Error(
      source === "PDF"
        ? "No exhibitor rows were found. If the guide is a scan rather than real text, there's nothing to extract — try a spreadsheet or paste the directory page instead."
        : "No exhibitor rows were found in that text."
    );
  }

  const importId = await stageImport(tradeShowId, {
    source,
    fileName,
    rawText: trimmed,
    rows: rows.map((r) => ({ ...r, origin: "rules" })),
  });
  return { importId, found: rows.length, skipped };
}

/** Parses a delimited/spreadsheet grid with a chosen column map and stages it. */
export async function stageImportFromGrid(
  tradeShowId: string,
  grid: string[][],
  columnMap: FieldKey[],
  opts: { source: string; fileName?: string; hasHeader: boolean }
) {
  await requireManage(tradeShowId);
  const dataRows = opts.hasHeader ? grid.slice(1) : grid;
  const rows = applyColumnMap(dataRows, columnMap, opts.hasHeader ? 2 : 1);
  if (rows.length === 0) throw new Error("No company names were found in that file.");
  return stageImport(tradeShowId, {
    source: opts.source,
    fileName: opts.fileName,
    columnMap,
    rows: rows.map((r) => ({ ...r, origin: "file" as const })),
  });
}

/** Guesses the column map for a grid, for the mapping screen. */
export async function suggestColumnMap(grid: string[][]) {
  const first = grid[0] ?? [];
  const hasHeader = looksLikeHeaderRow(first);
  const map = hasHeader
    ? guessColumnMap(first)
    : // No header: assume the first column is the company and leave the rest
      // for a human, rather than guessing from data values.
      first.map((_, i) => (i === 0 ? ("companyName" as FieldKey) : ("ignore" as FieldKey)));
  return { hasHeader, map, headers: first };
}

export async function setImportItemAccepted(itemId: string, accepted: boolean) {
  const item = await prisma.exhibitorImportItem.findUnique({
    where: { id: itemId },
    select: { import: { select: { tradeShowId: true } } },
  });
  if (!item) throw new Error("That row no longer exists.");
  await requireManage(item.import.tradeShowId);
  await prisma.exhibitorImportItem.update({ where: { id: itemId }, data: { accepted } });
}

/** "Keep separate" in the review table — drops the merge suggestion for one row. */
export async function clearImportItemMatch(itemId: string) {
  const item = await prisma.exhibitorImportItem.findUnique({
    where: { id: itemId },
    select: { import: { select: { tradeShowId: true } } },
  });
  if (!item) throw new Error("That row no longer exists.");
  await requireManage(item.import.tradeShowId);
  await prisma.exhibitorImportItem.update({
    where: { id: itemId },
    data: { matchedVendorId: null, matchKind: "none", matchReason: null },
  });
}

export async function setAllImportItemsAccepted(importId: string, accepted: boolean) {
  const imp = await prisma.exhibitorImport.findUnique({
    where: { id: importId },
    select: { tradeShowId: true },
  });
  if (!imp) throw new Error("That import no longer exists.");
  await requireManage(imp.tradeShowId);
  await prisma.exhibitorImportItem.updateMany({ where: { importId }, data: { accepted } });
}


/**
 * Commits an import.
 *
 * Rules that matter:
 *  - Only ticked rows are touched.
 *  - A row with a confirmed match updates that vendor; it never creates a second.
 *  - Updating a vendor only FILLS BLANKS. An import must never overwrite a
 *    description or website someone edited by hand — the imported data is
 *    usually worse than what a person typed, and losing it silently is exactly
 *    the kind of bug nobody reports because nobody notices.
 */
export async function applyImport(importId: string): Promise<ApplyResult> {
  const imp = await prisma.exhibitorImport.findUnique({
    where: { id: importId },
    select: { tradeShowId: true, status: true },
  });
  if (!imp) throw new Error("That import no longer exists.");
  if (imp.status === "APPLIED") throw new Error("This import has already been applied.");
  const { me } = await requireManage(imp.tradeShowId);

  const result = await applyImportCore(prisma, importId, me);
  refresh(imp.tradeShowId);
  return result;
}

export async function discardImport(importId: string) {
  const imp = await prisma.exhibitorImport.findUnique({
    where: { id: importId },
    select: { tradeShowId: true, status: true },
  });
  if (!imp) return;
  await requireManage(imp.tradeShowId);
  if (imp.status === "APPLIED") throw new Error("An applied import can't be discarded.");
  await prisma.exhibitorImport.delete({ where: { id: importId } });
  refresh(imp.tradeShowId);
}
