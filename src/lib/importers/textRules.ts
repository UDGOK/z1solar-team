/**
 * Rule-based extraction of exhibitors from unstructured text — a block pasted
 * out of a show's online directory, or the text layer of a PDF floor guide.
 *
 * Rules run before any AI pass, for the same reason meeting-note extraction
 * works that way: booth codes and company-name lines are regular enough to
 * catch deterministically, and a deterministic result can be explained to the
 * person reviewing it. The AI pass afterwards only adds what rules genuinely
 * can't do — summarising what a company actually does.
 *
 * Every row this produces carries a confidence and a reason, and low-confidence
 * rows arrive UNTICKED in the review table. Section headings look almost
 * exactly like company names, so the parser assumes it will get some wrong and
 * makes those cheap to reject rather than pretending to be certain.
 */

import { cleanCompanyName } from "../vendors/match";
import { normaliseUrl, type RawRow } from "./columnMap";

/** Booth codes: "B1420", "A-0912", "1220", "Booth 4F-230", "Stand N7". */
const BOOTH_INLINE =
  /(?:\b(?:booth|stand|stall)\s*[#:]?\s*)([A-Z]{0,3}[-\s]?\d{1,5}[A-Z]?)\b/i;
const BOOTH_TRAILING = /\s[|\-–—\t]*\s*([A-Z]{1,3}-?\d{2,5}[A-Z]?)\s*$/;
/**
 * A whole segment that is nothing but a booth code: "B1420", "A-0912",
 * "Booth 4F-230", "1220". Anchored at both ends so a company whose name starts
 * with a number ("1547 Critical Systems Realty") is never mistaken for one.
 */
const BOOTH_SEGMENT =
  /^(?:booth|stand|stall)?\s*[#:]?\s*([A-Z]{0,3}[-\s]?\d{1,5}[A-Z]?)$/i;
const URL_IN_LINE = /\b((?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+(?:\/\S*)?)/i;
const EMAIL_IN_LINE = /\b([\w.+-]+@[\w-]+\.[\w.-]+)\b/;

/**
 * Lines that are structure, not exhibitors. Getting this list wrong in the
 * permissive direction is fine — a stray heading appears unticked in review.
 * Getting it wrong in the aggressive direction silently drops real companies,
 * so nothing here matches on company-shaped text alone.
 */
const NOISE_PATTERNS: RegExp[] = [
  /^\s*page\s+\d+(\s+of\s+\d+)?\s*$/i,
  /^\s*\d{1,3}\s*$/,
  /^\s*(exhibitor|sponsor|attendee|company|companies)\s*(list|directory|index)\s*$/i,
  /^\s*(hall|pavilion|pavillion|zone|level|floor|aisle)\b.{0,40}$/i,
  /^\s*(a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z)\s*$/i,
  /^\s*(continued|cont\.?|see\s+page)\b/i,
  /^\s*(table\s+of\s+contents|contents|index|welcome|about\s+us|floor\s*plan)\s*$/i,
  /^\s*(diamond|platinum|gold|silver|bronze|registration)\s+sponsors?\s*$/i,
  /^\s*©.*$/,
  /^\s*[-–—_=*.]{3,}\s*$/,
];

/** Sponsor-tier headings — not exhibitors, but they label the rows beneath. */
const TIER_HEADING =
  /^\s*(diamond|platinum|gold|silver|bronze|headline|lead|registration|founding)\s*(sponsors?|partners?|level)?\s*:?\s*$/i;

function isNoise(line: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(line));
}

/**
 * A plausible company name. Rejects sentences and fragments rather than
 * anything that merely looks unusual — exhibitor lists are full of odd names
 * ("Doodie Calls", "autoLOTO", "1547 Critical Systems Realty") that are real.
 */
function looksLikeCompany(line: string): { ok: boolean; reason?: string } {
  const s = line.trim();
  if (s.length < 2) return { ok: false, reason: "Too short to be a company name." };
  if (s.length > 90) return { ok: false, reason: "Too long — looks like prose rather than a name." };
  if (!/[A-Za-z]/.test(s)) return { ok: false, reason: "No letters." };
  // Trailing sentence punctuation means it's a sentence.
  if (/[.!?]\s*$/.test(s) && !/\b(inc|ltd|llc|co|corp|s\.a|n\.v)\.\s*$/i.test(s)) {
    return { ok: false, reason: "Ends like a sentence." };
  }
  const words = s.split(/\s+/);
  if (words.length > 10) return { ok: false, reason: "Too many words for a company name." };
  // Starting lowercase is usually a wrapped continuation line — but genuine
  // lowercase-first brands exist (autoLOTO, iCloud), so only reject when it
  // also reads like prose.
  if (/^[a-z]/.test(s) && words.length > 4) {
    return { ok: false, reason: "Looks like a wrapped continuation of the line above." };
  }
  return { ok: true };
}

export type TextParseResult = {
  rows: (RawRow & { confidence: "high" | "medium" | "low"; reason?: string })[];
  /** Lines the parser deliberately discarded, for the "what was skipped" count. */
  skipped: number;
};

/**
 * Extracts exhibitor rows from free text.
 *
 * Strategy: work line by line. A line that carries a booth code is treated as a
 * company with high confidence — a booth code is a strong signal. A bare line
 * that merely looks like a name is medium at best, and a following indented or
 * sentence-like line is folded in as its description.
 */
export function parseExhibitorText(text: string): TextParseResult {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const rows: TextParseResult["rows"] = [];
  let skipped = 0;
  let currentTier: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    if (TIER_HEADING.test(line)) {
      currentTier = line.replace(/sponsors?|partners?|level|:/gi, "").trim();
      skipped++;
      continue;
    }
    if (isNoise(line)) {
      skipped++;
      continue;
    }

    // --- split the line into fields, then classify each one ---
    //
    // Directory rows are column layouts flattened into text, and the column
    // boundary survives as a pipe, a tab, or a run of spaces. Splitting first
    // and classifying second handles every ordering — "Name | Booth | URL",
    // "Name  URL  Booth", "Name Booth" — whereas running regexes across the
    // whole line only ever handles the orderings someone thought to write down.
    const segments = line
      .split(/\s*[|•·»]\s*|\t+|\s{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);

    let booth: string | undefined;
    let websiteUrl: string | undefined;
    let contactEmail: string | undefined;
    const leftovers: string[] = [];
    let confidence: "high" | "medium" | "low" = "medium";
    let reason: string | undefined;

    for (const seg of segments) {
      const email = seg.match(EMAIL_IN_LINE);
      if (!contactEmail && email && email[0] === seg.replace(/[<>(),;]/g, "").trim()) {
        contactEmail = email[1];
        continue;
      }
      const url = seg.match(URL_IN_LINE);
      if (
        !websiteUrl &&
        url &&
        /\.(com|net|org|io|ai|co|energy|us|eu|de|cn|uk|tech|solar|cloud|dev)\b/i.test(url[1]) &&
        // Only treat the segment as a URL when that's essentially all it is —
        // otherwise a company called "Vast.ai, inc" loses its own name.
        url[1].length >= seg.replace(/^https?:\/\//i, "").length - 2
      ) {
        const n = normaliseUrl(url[1]);
        if (n) {
          websiteUrl = n;
          continue;
        }
      }
      if (!booth) {
        const b = seg.match(BOOTH_SEGMENT);
        if (b) {
          booth = b[1].replace(/\s+/g, "").toUpperCase();
          confidence = "high";
          continue;
        }
      }
      leftovers.push(seg);
    }

    // Anything left that wasn't structured data is the name, plus possibly a
    // profile sitting in a later column.
    let work = leftovers.shift() ?? "";
    // A booth code can still be glued onto the end of the name segment with a
    // single space ("Fluence Energy B2201") or introduced by a keyword.
    if (!booth) {
      const inline = work.match(BOOTH_INLINE);
      if (inline) {
        booth = inline[1].replace(/\s+/g, "").toUpperCase();
        work = work.replace(inline[0], " ").trim();
        confidence = "high";
      } else {
        const trailing = work.match(BOOTH_TRAILING);
        if (trailing && trailing.index !== undefined) {
          booth = trailing[1].replace(/\s+/g, "").toUpperCase();
          work = work.slice(0, trailing.index).trim();
          confidence = "high";
        }
      }
    }

    const trailingProfile = leftovers.find((s) => s.length > 25);
    work = work.replace(/\s*[–—]+\s*$/g, " ").replace(/\s{2,}/g, " ").trim();
    const name = cleanCompanyName(work);
    if (!name) {
      skipped++;
      continue;
    }

    const verdict = looksLikeCompany(name);
    if (!verdict.ok) {
      // Prose directly beneath a company is very likely its profile text.
      const prev = rows[rows.length - 1];
      if (prev && !prev.description && name.length > 25) {
        prev.description = name;
        continue;
      }
      skipped++;
      continue;
    }

    // A bare name with nothing else attached is the weakest signal there is —
    // this is exactly what a section heading looks like.
    if (!booth && !websiteUrl && !contactEmail) {
      confidence = "low";
      reason =
        "Only a bare line of text — no booth, website or email nearby. Could be a section heading rather than an exhibitor.";
    }

    rows.push({
      companyName: name,
      booth,
      websiteUrl,
      contactEmail,
      description: trailingProfile,
      sponsorTier: currentTier,
      listing: currentTier ? "Sponsor" : "Exhibitor",
      sourceLine: i + 1,
      confidence,
      reason,
    });
  }

  return { rows, skipped };
}
