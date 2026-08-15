/**
 * The parts of the import pipeline that are pure database work.
 *
 * Split out from actions.ts so they can be run against a real database in the
 * test suite. The server actions in actions.ts are thin wrappers that do the
 * permission check and then call these — which means the code covered by
 * `npm test` is the same code that runs in production, rather than a
 * reimplementation of it that can drift.
 */

import type { PrismaClient } from "@prisma/client";
import { logActivity } from "../activity";
import {
  cleanCompanyName,
  matchKey,
  tidyDisplayName,
  findVendorMatch,
  findInternalDuplicates,
  type VendorCandidate,
} from "../vendors/match";
import type { FieldKey, RawRow } from "../importers/columnMap";

export type Actor = { id: string; name: string };

export type StageInput = {
  source: string;
  fileName?: string;
  rawText?: string;
  columnMap?: FieldKey[];
  rows: (RawRow & { confidence?: "high" | "medium" | "low"; reason?: string; origin?: string })[];
};

export type ApplyResult = {
  vendorsCreated: number;
  vendorsUpdated: number;
  exhibitorsCreated: number;
  exhibitorsUpdated: number;
  skipped: number;
};

export function normaliseListing(raw?: string | null): string {
  const s = String(raw || "").toLowerCase();
  if (s.includes("sponsor")) return "Sponsor";
  if (s.includes("both")) return "Both";
  return "Exhibitor";
}

/**
 * Links tags to a vendor, skipping links that already exist.
 *
 * Written the long way instead of `createMany({ skipDuplicates: true })`
 * because skipDuplicates is a PostgreSQL-only option — the SQLite client used
 * for local testing rejects it outright. Doing the filtering here means the
 * behaviour verified locally is the behaviour that ships, the same reasoning
 * behind assigning PR numbers in code rather than with autoincrement().
 */
export async function linkVendorTags(db: PrismaClient, vendorId: string, tagIds: string[]) {
  const wanted = Array.from(new Set(tagIds.filter(Boolean)));
  if (wanted.length === 0) return;
  const existing = await db.vendorTagLink.findMany({
    where: { vendorId, tagId: { in: wanted } },
    select: { tagId: true },
  });
  const have = new Set(existing.map((e) => e.tagId));
  const missing = wanted.filter((t) => !have.has(t));
  if (missing.length === 0) return;
  await db.vendorTagLink.createMany({ data: missing.map((tagId) => ({ vendorId, tagId })) });
}

/** Parses nothing — takes already-parsed rows and stages them for review. */
export async function stageImportCore(
  db: PrismaClient,
  tradeShowId: string,
  actor: Actor,
  opts: StageInput
): Promise<string> {
  if (opts.rows.length === 0) throw new Error("Nothing to import — no company names were found.");

  // Load existing vendors once. At a few thousand companies this is far cheaper
  // than a query per row, and the matcher itself is pure CPU work.
  const candidates: VendorCandidate[] = await db.vendor.findMany({
    select: { id: true, name: true, matchKey: true },
  });

  const internal = findInternalDuplicates(opts.rows.map((r) => r.companyName));

  const imp = await db.exhibitorImport.create({
    data: {
      tradeShowId,
      source: opts.source,
      fileName: opts.fileName || null,
      rawText: opts.rawText ? opts.rawText.slice(0, 400_000) : null,
      columnMap: opts.columnMap ? JSON.stringify(opts.columnMap) : null,
      importedById: actor.id,
    },
  });

  await db.exhibitorImportItem.createMany({
    data: opts.rows.map((r, i) => {
      const dupOf = internal.get(i);
      const match = findVendorMatch(r.companyName, candidates);

      let confidence: string = r.confidence ?? "high";
      let reason: string | null = r.reason ?? null;
      let accepted = confidence !== "low";

      if (dupOf !== undefined) {
        // A duplicate inside the incoming file itself — the published
        // Datacloud USA 2026 list contains one. Unticked so it isn't
        // imported twice, but shown so the reviewer knows it was there.
        confidence = "low";
        reason = `Same company as row ${dupOf + 1} of this file ("${opts.rows[dupOf].companyName}").`;
        accepted = false;
      }

      return {
        importId: imp.id,
        companyName: tidyDisplayName(r.companyName),
        booth: r.booth || null,
        hall: r.hall || null,
        websiteUrl: r.websiteUrl || null,
        description: r.description || null,
        tagNames: r.tagNames || null,
        sector: r.sector || null,
        contactName: r.contactName || null,
        contactEmail: r.contactEmail || null,
        hqCountry: r.hqCountry || null,
        listing: normaliseListing(r.listing),
        sponsorTier: r.sponsorTier || null,
        matchedVendorId: match.vendor?.id ?? null,
        matchReason: match.reason,
        matchKind: match.kind,
        confidence,
        origin: r.origin ?? "file",
        reason,
        sourceLine: r.sourceLine,
        accepted,
        sortOrder: i,
      };
    }),
  });

  return imp.id;
}

/**
 * Commits an import.
 *
 * Rules that matter:
 *  - Only ticked rows are touched.
 *  - A row with a confirmed match updates that vendor; it never creates a second.
 *  - Updating a vendor only FILLS BLANKS. An import must never overwrite a
 *    description or website someone edited by hand — imported data is usually
 *    worse than what a person typed, and losing it silently is exactly the kind
 *    of bug nobody reports because nobody notices it happened.
 */
export async function applyImportCore(
  db: PrismaClient,
  importId: string,
  actor: Actor
): Promise<ApplyResult> {
  const imp = await db.exhibitorImport.findUnique({
    where: { id: importId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!imp) throw new Error("That import no longer exists.");
  if (imp.status === "APPLIED") throw new Error("This import has already been applied.");

  const result: ApplyResult = {
    vendorsCreated: 0,
    vendorsUpdated: 0,
    exhibitorsCreated: 0,
    exhibitorsUpdated: 0,
    skipped: 0,
  };

  // Resolve tag names once.
  const allTags = await db.vendorTag.findMany({ select: { id: true, slug: true } });
  const tagBySlug = new Map(allTags.map((t) => [t.slug, t.id]));

  for (const item of imp.items) {
    if (!item.accepted) {
      result.skipped++;
      continue;
    }

    const name = cleanCompanyName(item.companyName);
    if (!name) {
      result.skipped++;
      continue;
    }

    let vendorId = item.matchedVendorId ?? undefined;

    if (vendorId) {
      const existing = await db.vendor.findUnique({ where: { id: vendorId } });
      if (!existing) {
        vendorId = undefined;
      } else {
        const fill: Record<string, unknown> = {};
        if (!existing.description && item.description) fill.description = item.description;
        if (!existing.websiteUrl && item.websiteUrl) fill.websiteUrl = item.websiteUrl;
        if (!existing.hqCountry && item.hqCountry) fill.hqCountry = item.hqCountry;
        if (!existing.sector && item.sector) fill.sector = item.sector;
        if (Object.keys(fill).length > 0) {
          await db.vendor.update({ where: { id: vendorId }, data: fill });
          result.vendorsUpdated++;
        }
      }
    }

    if (!vendorId) {
      const created = await db.vendor.create({
        data: {
          name,
          matchKey: matchKey(name),
          description: item.description,
          websiteUrl: item.websiteUrl,
          hqCountry: item.hqCountry,
          sector: item.sector,
          createdById: actor.id,
        },
      });
      vendorId = created.id;
      result.vendorsCreated++;
    }

    // Tags from the source file, matched to existing tags only. Import does not
    // invent tags — an uncontrolled tag list from a 1,200-row file would make
    // the filter useless within one import.
    if (item.tagNames) {
      const ids = item.tagNames
        .split(/[,;/]/)
        .map((t) => tagBySlug.get(t.trim().toLowerCase()))
        .filter((x): x is string => !!x);
      await linkVendorTags(db, vendorId!, ids);
    }

    if (item.contactEmail || item.contactName) {
      const dupe = await db.vendorContact.findFirst({
        where: { vendorId, email: item.contactEmail ?? undefined },
        select: { id: true },
      });
      if (!dupe) {
        await db.vendorContact.create({
          data: {
            vendorId,
            name: item.contactName || item.contactEmail || "Contact",
            email: item.contactEmail,
          },
        });
      }
    }

    const existingRow = await db.tradeShowExhibitor.findUnique({
      where: { tradeShowId_vendorId: { tradeShowId: imp.tradeShowId, vendorId } },
    });

    if (existingRow) {
      const fill: Record<string, unknown> = {};
      if (!existingRow.booth && item.booth) fill.booth = item.booth;
      if (!existingRow.hall && item.hall) fill.hall = item.hall;
      if (!existingRow.sponsorTier && item.sponsorTier) fill.sponsorTier = item.sponsorTier;
      // A company listed as both an exhibitor and a sponsor is genuinely both.
      if (existingRow.listing !== item.listing && item.listing) fill.listing = "Both";
      if (Object.keys(fill).length > 0) {
        await db.tradeShowExhibitor.update({ where: { id: existingRow.id }, data: fill });
        result.exhibitorsUpdated++;
      }
    } else {
      await db.tradeShowExhibitor.create({
        data: {
          tradeShowId: imp.tradeShowId,
          vendorId,
          booth: item.booth,
          hall: item.hall,
          listing: item.listing,
          sponsorTier: item.sponsorTier,
        },
      });
      result.exhibitorsCreated++;
    }

    await db.exhibitorImportItem.update({
      where: { id: item.id },
      data: { createdVendorId: vendorId },
    });
  }

  await db.exhibitorImport.update({
    where: { id: importId },
    data: { status: "APPLIED", appliedAt: new Date() },
  });

  await logActivity({
    actor,
    action: "task.created",
    summary: `Imported ${result.exhibitorsCreated} exhibitors (${result.vendorsCreated} new companies)`,
    meta: { tradeShowId: imp.tradeShowId, importId, ...result },
  });

  return result;
}
