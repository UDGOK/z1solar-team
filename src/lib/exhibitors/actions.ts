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
import { syncMeetingTask } from "./meetingTask";
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
  /** Replaces the whole set of people chasing this meeting. */
  ownerIds?: string[];
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
    if (patch.ownerIds) {
      const wanted = Array.from(new Set(patch.ownerIds.filter(Boolean)));
      await tx.tradeShowExhibitorOwner.deleteMany({ where: { exhibitorId } });
      if (wanted.length > 0) {
        await tx.tradeShowExhibitorOwner.createMany({
          data: wanted.map((memberId) => ({ exhibitorId, memberId })),
        });
      }
      // Keep the deprecated single field pointing at the first owner so any
      // older query still resolves to a real person rather than null.
      await tx.tradeShowExhibitor.update({
        where: { id: exhibitorId },
        data: { ownerId: wanted[0] ?? null },
      });
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

  // Keep the owner's task in step with the flag. Deliberately after the write
  // and outside the transaction: a task-sync failure must never roll back the
  // edit the person actually made.
  try {
    await syncMeetingTask(prisma, exhibitorId);
  } catch (e) {
    console.error("[exhibitors] meeting task sync failed:", e);
  }

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

// ---------------------------------------------------------------------------
// Upload entry point
// ---------------------------------------------------------------------------

/**
 * Accepts an uploaded file from the import wizard, reads it according to its
 * type, and stages the rows for review.
 *
 * Returns a summary rather than redirecting so the wizard can show what was
 * found — including how many lines were skipped, which is the number that tells
 * you whether a parse went wrong.
 */
export async function stageImportFromUpload(tradeShowId: string, form: FormData) {
  await requireManage(tradeShowId);

  const file = form.get("file");
  if (!file || typeof file === "string") throw new Error("No file was uploaded.");

  const f = file as File;
  const { detectKind, readDelimitedBuffer, readWorkbookBuffer, readPdfBuffer, MAX_UPLOAD_BYTES } =
    await import("../importers/sources");

  if (f.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is ${(f.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`
    );
  }

  const kind = detectKind(f.name, f.type);
  if (kind === "unknown") {
    throw new Error(
      `Can't read "${f.name}". Use .csv, .xlsx or .pdf. (The old .xls format isn't supported — open it in Excel and Save As .xlsx.)`
    );
  }

  const buf = Buffer.from(await f.arrayBuffer());

  if (kind === "pdf") {
    const { text, pages } = await readPdfBuffer(buf);
    if (!text.trim()) {
      throw new Error(
        `No text found in that ${pages}-page PDF. It's probably a scan rather than real text — there's nothing to extract. Try a spreadsheet, or paste the directory page instead.`
      );
    }
    const r = await stageImportFromText(tradeShowId, text, "PDF", f.name);
    return { importId: r.importId, found: r.found, skipped: r.skipped, kind };
  }

  const grid =
    kind === "xlsx" ? await readWorkbookBuffer(buf) : readDelimitedBuffer(buf);

  if (grid.rows.length === 0) throw new Error("That file appears to be empty.");

  const { hasHeader, map } = await suggestColumnMap(grid.rows);
  const importId = await stageImportFromGrid(tradeShowId, grid.rows, map, {
    source: kind === "xlsx" ? "FILE_XLSX" : "FILE_CSV",
    fileName: f.name,
    hasHeader,
  });

  const found = await prisma.exhibitorImportItem.count({ where: { importId } });
  return {
    importId,
    found,
    skipped: grid.rows.length - (hasHeader ? 1 : 0) - found,
    kind,
    sheetName: grid.sheetName,
  };
}

/** Loads a staged import for the review screen. */
export async function getImportForReview(importId: string) {
  const imp = await prisma.exhibitorImport.findUnique({
    where: { id: importId },
    include: {
      items: { orderBy: { sortOrder: "asc" }, include: { matchedVendor: { select: { name: true } } } },
      tradeShow: { select: { id: true, name: true } },
    },
  });
  if (!imp) throw new Error("That import no longer exists.");
  const me = await requireMember();
  const access = await getExhibitorAccess(me, imp.tradeShowId);
  if (!access.canManage) throw new Error("Only trade show managers can review imports.");

  return {
    id: imp.id,
    status: imp.status,
    fileName: imp.fileName,
    source: imp.source,
    showId: imp.tradeShow.id,
    showName: imp.tradeShow.name,
    items: imp.items.map((i) => ({
      id: i.id,
      companyName: i.companyName,
      booth: i.booth,
      description: i.description,
      websiteUrl: i.websiteUrl,
      listing: i.listing,
      sponsorTier: i.sponsorTier,
      confidence: i.confidence,
      origin: i.origin,
      reason: i.reason,
      matchKind: i.matchKind,
      matchReason: i.matchReason,
      matchedVendorName: i.matchedVendor?.name ?? null,
      accepted: i.accepted,
      sourceLine: i.sourceLine,
    })),
  };
}

// ---------------------------------------------------------------------------
// AI vendor scoring
// ---------------------------------------------------------------------------

export type ScoringProgress = {
  scored: number;
  unknown: number;
  failed: number;
  remaining: number;
  error: string | null;
};

/** How many vendors on this show still have no reputation score. */
export async function countUnscoredVendors(tradeShowId: string) {
  await requireManage(tradeShowId);
  const [total, unscored] = await Promise.all([
    prisma.tradeShowExhibitor.count({ where: { tradeShowId } }),
    prisma.tradeShowExhibitor.count({
      where: { tradeShowId, vendor: { reputationScore: null, riskAssessedAt: null } },
    }),
  ]);
  const { isVendorScoringConfigured } = await import("../ai/vendorScore");
  return { total, unscored, configured: isVendorScoringConfigured() };
}

/**
 * Scores one batch of unassessed vendors and writes the results.
 *
 * Deliberately batched and driven from the client rather than looping over 800
 * companies in a single action: a Vercel function has a hard execution limit,
 * and a run that dies at company 400 with no record of what it did is worse
 * than no run at all. Each call is small, idempotent and leaves a durable
 * result, so it resumes simply by being called again.
 *
 * Everything written here is marked riskSource="ai" and the UI labels it
 * unverified. A human editing a score sets riskSource="manual", which is how
 * a checked number becomes distinguishable from a generated one.
 */
export async function scoreNextVendorBatch(tradeShowId: string): Promise<ScoringProgress> {
  await requireManage(tradeShowId);

  const { scoreVendorBatch, SCORE_BATCH_SIZE, isVendorScoringConfigured } = await import(
    "../ai/vendorScore"
  );

  if (!isVendorScoringConfigured()) {
    return {
      scored: 0, unknown: 0, failed: 0, remaining: 0,
      error: "DEEPSEEK_API_KEY isn't set in Vercel, so there's nothing to score with.",
    };
  }

  const rows = await prisma.tradeShowExhibitor.findMany({
    where: { tradeShowId, vendor: { reputationScore: null, riskAssessedAt: null } },
    include: {
      vendor: {
        select: { id: true, name: true, description: true, sector: true, hqCountry: true },
      },
    },
    take: SCORE_BATCH_SIZE,
  });

  if (rows.length === 0) {
    return { scored: 0, unknown: 0, failed: 0, remaining: 0, error: null };
  }

  const { scores, error } = await scoreVendorBatch(rows.map((r) => r.vendor));

  if (error) {
    const remaining = await prisma.tradeShowExhibitor.count({
      where: { tradeShowId, vendor: { reputationScore: null, riskAssessedAt: null } },
    });
    return { scored: 0, unknown: 0, failed: rows.length, remaining, error };
  }

  const now = new Date();
  let scored = 0;
  let unknown = 0;

  for (const s of scores) {
    // riskAssessedAt is stamped even when the score is null, so an unrecognised
    // company counts as "we asked" and is not retried forever.
    await prisma.vendor.update({
      where: { id: s.id },
      data: {
        reputationScore: s.score,
        riskNotes: s.notes,
        riskSource: "ai",
        riskAssessedAt: now,
      },
    });
    if (s.score === null) unknown++;
    else scored++;
  }

  // Anything the model silently omitted still gets stamped, or the run loops
  // on the same rows forever.
  const answered = new Set(scores.map((s) => s.id));
  const skipped = rows.map((r) => r.vendor.id).filter((id) => !answered.has(id));
  if (skipped.length > 0) {
    await prisma.vendor.updateMany({
      where: { id: { in: skipped } },
      data: { riskSource: "ai", riskAssessedAt: now, riskNotes: null },
    });
  }

  const remaining = await prisma.tradeShowExhibitor.count({
    where: { tradeShowId, vendor: { reputationScore: null, riskAssessedAt: null } },
  });

  refresh(tradeShowId);
  return { scored, unknown, failed: skipped.length, remaining, error: null };
}

/** A human overriding a score — this is what makes it verified. */
export async function setVendorScore(
  vendorId: string,
  score: number | null,
  notes: string | null,
  fromTradeShowId?: string
) {
  const me = await requireMember();
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
    throw new Error("Score must be between 0 and 100.");
  }
  await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      reputationScore: score,
      riskNotes: notes?.trim() || null,
      riskSource: "manual",
      riskAssessedAt: new Date(),
      riskAssessedById: me.id,
    },
  });
  if (fromTradeShowId) refresh(fromTradeShowId);
}

// ---------------------------------------------------------------------------
// Two-step upload: read the file, confirm the mapping, THEN stage
// ---------------------------------------------------------------------------

export type PreparedUpload = {
  /** Header row as it appears in their file. */
  headers: string[];
  /** Our best guess, one entry per header. */
  map: FieldKey[];
  hasHeader: boolean;
  /** First few real values per column, so a wrong guess is visible not theoretical. */
  samples: string[][];
  rowCount: number;
  fileName: string;
  source: string;
  sheetName?: string;
  otherSheets?: string[];
  /** The parsed grid, handed back so the confirm step needn't re-read the file. */
  grid: string[][];
};

/**
 * Reads an uploaded spreadsheet and returns the grid plus a suggested mapping,
 * WITHOUT staging anything.
 *
 * Separated from staging so the reviewer sees, and can correct, how their
 * columns line up before a single row is written. Auto-guessing alone was the
 * known weak point: it handled both real files we had, but a show with unusual
 * headers would silently import a description column as the company name and
 * the only recovery was to fix the spreadsheet and start over.
 *
 * PDFs and pasted text skip this — they have no columns to map.
 */
export async function prepareUpload(tradeShowId: string, form: FormData): Promise<PreparedUpload> {
  await requireManage(tradeShowId);

  const file = form.get("file");
  if (!file || typeof file === "string") throw new Error("No file was uploaded.");
  const f = file as File;

  const { detectKind, readDelimitedBuffer, readWorkbookBuffer, MAX_UPLOAD_BYTES } = await import(
    "../importers/sources"
  );

  if (f.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is ${(f.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`
    );
  }

  const kind = detectKind(f.name, f.type);
  if (kind !== "csv" && kind !== "xlsx") {
    throw new Error("That isn't a spreadsheet. Use the PDF or paste option instead.");
  }

  const buf = Buffer.from(await f.arrayBuffer());
  const grid = kind === "xlsx" ? await readWorkbookBuffer(buf) : readDelimitedBuffer(buf);
  if (grid.rows.length === 0) throw new Error("That file appears to be empty.");

  const { hasHeader, map, headers } = await suggestColumnMap(grid.rows);

  // Up to three real values per column. Showing the data beside the guess is
  // what turns "is this right?" into an obvious yes or no.
  const firstData = hasHeader ? 1 : 0;
  const width = Math.max(...grid.rows.slice(0, 20).map((r) => r.length), headers.length);
  const samples: string[][] = [];
  for (let c = 0; c < width; c++) {
    const vals: string[] = [];
    for (let r = firstData; r < grid.rows.length && vals.length < 3; r++) {
      const v = String(grid.rows[r]?.[c] ?? "").trim();
      if (v) vals.push(v.length > 60 ? v.slice(0, 59) + "…" : v);
    }
    samples.push(vals);
  }

  return {
    headers: hasHeader
      ? headers.map((h, i) => String(h || "").trim() || `Column ${i + 1}`)
      : Array.from({ length: width }, (_, i) => `Column ${i + 1}`),
    map,
    hasHeader,
    samples,
    rowCount: grid.rows.length - (hasHeader ? 1 : 0),
    fileName: f.name,
    source: kind === "xlsx" ? "FILE_XLSX" : "FILE_CSV",
    sheetName: grid.sheetName,
    otherSheets: grid.otherSheets,
    grid: grid.rows,
  };
}

/** Stages a prepared upload using the mapping the reviewer confirmed. */
export async function stagePreparedUpload(
  tradeShowId: string,
  prepared: { grid: string[][]; map: FieldKey[]; hasHeader: boolean; source: string; fileName: string }
) {
  await requireManage(tradeShowId);

  if (!prepared.map.includes("companyName")) {
    throw new Error("Pick which column holds the company name — nothing can be imported without it.");
  }

  const importId = await stageImportFromGrid(tradeShowId, prepared.grid, prepared.map, {
    source: prepared.source,
    fileName: prepared.fileName,
    hasHeader: prepared.hasHeader,
  });

  const found = await prisma.exhibitorImportItem.count({ where: { importId } });
  return {
    importId,
    found,
    skipped: prepared.grid.length - (prepared.hasHeader ? 1 : 0) - found,
  };
}
