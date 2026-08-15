/**
 * Vendor name normalisation and duplicate detection.
 *
 * The whole value of a global Vendor table is that a company keeps its history
 * across shows. That only works if "SUNGROW" (Datacloud USA's listing) and
 * "Sungrow Power Supply Co., Ltd." (how RE+ lists them) end up as one record.
 *
 * The bias here is deliberately CONSERVATIVE: this code only ever *suggests* a
 * merge, and a human confirms it in the import review step. A missed suggestion
 * costs one manual merge. A wrong automatic merge silently welds two unrelated
 * companies — and their notes, contacts and meeting history — together, which
 * is very hard to notice and worse to unpick. So when in doubt, don't match.
 */

/** Legal-entity suffixes stripped from the end of a name before comparison. */
const LEGAL_SUFFIXES = new Set([
  "inc", "inc.", "incorporated", "llc", "l.l.c", "llp", "lllp", "ltd", "ltda",
  "limited", "co", "corp", "corporation", "company", "gmbh", "ag", "sa", "sas",
  "sarl", "srl", "spa", "plc", "lp", "pty", "bv", "nv", "ab", "as", "oy", "kk",
  "pte", "kft", "doo", "zoo", "cv", "sl", "sac", "cc", "pc", "pllc", "usa",
  "us", "america", "americas", "worldwide", "international", "intl", "global",
  "holdings", "holding", "group", "the",
]);

/**
 * Tokens too generic to carry a match on their own. If the only thing two names
 * share is words from this list, they are not treated as related — otherwise
 * "Power Electronics" and "Power Innovations International" look like the same
 * firm, and on a digital-infrastructure exhibitor list half the hall would
 * collapse into one vendor.
 */
const GENERIC_TOKENS = new Set([
  "power", "energy", "data", "datacenter", "datacenters", "centre", "centres",
  "center", "centers", "digital", "national", "american", "united", "solutions",
  "solution", "systems", "system", "services", "service", "technologies",
  "technology", "tech", "industries", "industrial", "partners", "ventures",
  "capital", "infrastructure", "networks", "network", "electric", "electrical",
  "engineering", "consulting", "consultants", "associates", "enterprises",
  "management", "resources", "products", "equipment", "supply", "north", "south",
  "east", "west", "new", "first", "prime", "advanced", "smart", "critical",
]);

/** Strips diacritics so "Telecomunicações" and "Telecomunicacoes" agree. */
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Splits a company name into comparable tokens.
 *
 * Punctuation becomes whitespace rather than being deleted, so "Vast.ai"
 * yields ["vast", "ai"] and not ["vastai"]. That distinction matters: it is
 * what keeps "Vast.ai, inc" and "Vast Networks" — two genuinely different
 * companies on the same Datacloud list — from being flagged as duplicates.
 */
export function tokenize(name: string): string[] {
  const cleaned = stripAccents(String(name || ""))
    .toLowerCase()
    // A trailing parenthetical is a qualifier, not part of the name:
    // "Cirion (Data Center)" is the same company as "Cirion".
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    // Collapse dotted abbreviations BEFORE punctuation is blanked, so "S.A."
    // becomes the single token "sa" and is recognised as a legal suffix. Left
    // as-is it splits into "s" + "a", and "Telecomunicações S.A." then looks
    // like a longer name than "Telecomunicacoes SA" rather than the same one.
    .replace(/\b(?:[a-z]\.){2,}/g, (m) => m.replace(/\./g, ""))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  let tokens = cleaned.split(/\s+/).filter(Boolean);

  // Drop legal suffixes from the end, repeatedly — "Bruns-Pak Worldwide, Inc."
  // sheds both "inc" and "worldwide".
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  // ...and a leading "the".
  while (tokens.length > 1 && tokens[0] === "the") tokens.shift();

  return tokens;
}

/**
 * The stored, indexed key used for cheap exact-ish lookups.
 * Deliberately NOT unique in the database: two unrelated firms can normalise
 * the same way, and a unique constraint would turn that into a failed import
 * rather than a question for a human.
 */
export function matchKey(name: string): string {
  return tokenize(name).join(" ");
}

/** A display-safe tidy of a name, used when creating a vendor from an import. */
export function cleanCompanyName(raw: string): string {
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  // Quotes and trailing separators interleave in real pasted listings
  // (`"Sungrow" —`), so one pass of each leaves the other stranded. Loop until
  // the string stops changing, with a hard bound so a pathological input can
  // never spin.
  for (let i = 0; i < 5; i++) {
    const before = s;
    // Wrapping quotes left behind by sloppy CSV exports.
    s = s.replace(/^["'“‘]+|["'”’]+$/g, "").trim();
    // Trailing separators from copied directory listings ("Sungrow —", "ACME |").
    s = s.replace(/^[\s\-–—|,;:]+|[\s\-–—|,;:]+$/g, "").trim();
    if (s === before) break;
  }
  return s;
}

/**
 * SHOUTY LIST NAMES are hard to read in a table. Title-case a name only when
 * it is entirely uppercase — anything with deliberate mixed case ("autoLOTO",
 * "ZutaCore", "MaxCell", "Vast.ai") is left exactly as the source had it,
 * because that casing is the brand.
 */
export function tidyDisplayName(raw: string): string {
  const s = cleanCompanyName(raw);
  if (!s) return s;
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (!letters || letters !== letters.toUpperCase()) return s;
  // Short all-caps names are usually acronyms worth keeping: DHD, ASG, PwC.
  if (letters.length <= 4) return s;

  const SMALL = new Set(["and", "of", "for", "the", "in", "on", "a", "an"]);
  const SHORT_WORDS = new Set(["co", "de", "la", "el", "du", "di"]);
  // Abbreviations that read wrong in title case. "Inc"/"Ltd"/"Co" are
  // deliberately absent — those ARE conventionally title-cased.
  const KEEP_UPPER = new Set([
    "usa", "uk", "llc", "plc", "llp", "pllc", "ems", "chp", "ai", "it", "hvac",
    "dc", "ac", "ups", "pv", "bess", "smr", "hq", "rd", "epc", "oem",
  ]);
  return s
    .split(/(\s+|[-/])/)
    .map((part) => {
      if (/^\s+$/.test(part) || part === "-" || part === "/") return part;
      const bare = part.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
      if (!bare) return part;
      if (KEEP_UPPER.has(bare)) return part.toUpperCase();
      if (SMALL.has(bare)) return part.toLowerCase();
      // Real two-letter words, not initials — "Co Ltd" must not become "CO Ltd".
      if (SHORT_WORDS.has(bare)) return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      // Two-letter fragments are nearly always initials ("WB Engineers",
      // "R&M USA"), and "Wb" looks like a typo.
      if (bare.length <= 2) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

export type MatchKind = "exact" | "normalised" | "fuzzy" | "none";

export type VendorCandidate = { id: string; name: string; matchKey: string };

export type MatchResult = {
  kind: MatchKind;
  vendor: VendorCandidate | null;
  /** Plain-English reason, shown verbatim in the review table. */
  reason: string | null;
  confidence: "high" | "medium" | "low";
};

const NO_MATCH: MatchResult = { kind: "none", vendor: null, reason: null, confidence: "high" };

/** True when every token is a generic industry word carrying no identity. */
function allGeneric(tokens: string[]): boolean {
  return tokens.length > 0 && tokens.every((t) => GENERIC_TOKENS.has(t) || t.length <= 2);
}

/** True when `short` is a leading token-for-token prefix of `long`. */
function isTokenPrefix(short: string[], long: string[]): boolean {
  if (short.length === 0 || short.length >= long.length) return false;
  return short.every((t, i) => t === long[i]);
}

/**
 * Finds the best duplicate candidate for an incoming company name.
 *
 * Three tiers, strongest first:
 *   exact      — identical once whitespace/case are ignored
 *   normalised — identical after legal suffixes are stripped
 *                ("Fractal EMS Inc." ↔ "Fractal EMS")
 *   fuzzy      — one name is a token-prefix of the other and the shared part
 *                carries real identity ("SUNGROW" ↔ "Sungrow Power Supply")
 *
 * Anything weaker returns no match on purpose.
 */
export function findVendorMatch(
  incomingName: string,
  candidates: VendorCandidate[]
): MatchResult {
  const name = cleanCompanyName(incomingName);
  if (!name) return NO_MATCH;

  const key = matchKey(name);
  const tokens = tokenize(name);
  if (tokens.length === 0) return NO_MATCH;

  const lowerName = name.toLowerCase().replace(/\s+/g, " ").trim();

  // Tier 1 — the same string.
  for (const c of candidates) {
    if (c.name.toLowerCase().replace(/\s+/g, " ").trim() === lowerName) {
      return {
        kind: "exact",
        vendor: c,
        reason: `Already on file as "${c.name}".`,
        confidence: "high",
      };
    }
  }

  // Tier 2 — the same once "Inc"/"Ltd"/"Group" and punctuation are removed.
  if (key) {
    for (const c of candidates) {
      if (c.matchKey && c.matchKey === key) {
        return {
          kind: "normalised",
          vendor: c,
          reason: `Matches "${c.name}" once punctuation and company suffixes are ignored.`,
          confidence: "high",
        };
      }
    }
  }

  // Tier 3 — one is a shortened form of the other.
  let best: { c: VendorCandidate; extra: number } | null = null;
  for (const c of candidates) {
    const cTokens = c.matchKey ? c.matchKey.split(" ").filter(Boolean) : tokenize(c.name);
    if (cTokens.length === 0) continue;

    const shorter = tokens.length <= cTokens.length ? tokens : cTokens;
    const longer = shorter === tokens ? cTokens : tokens;
    if (!isTokenPrefix(shorter, longer)) continue;

    // The shared part has to actually identify a company. "National Power" vs
    // "National Power Solutions" is only generic words, so it is left alone
    // rather than guessed at.
    if (allGeneric(shorter)) continue;

    const extra = longer.length - shorter.length;
    if (!best || extra < best.extra) best = { c, extra };
  }

  if (best) {
    return {
      kind: "fuzzy",
      vendor: best.c,
      // Hedged wording on purpose — this tier is a question, not a finding.
      reason: `Might be the same company as "${best.c.name}" — one name is a shortened form of the other. Check before merging.`,
      confidence: "medium",
    };
  }

  return NO_MATCH;
}

/**
 * Finds duplicates *within* one incoming list, before it ever reaches the
 * database. Real exhibitor directories contain them: Datacloud USA 2026 lists
 * "Pure Plastics & Metals" twice in its own published list.
 *
 * Returns a map of row index → index of the earlier row it duplicates.
 */
export function findInternalDuplicates(names: string[]): Map<number, number> {
  const seen = new Map<string, number>();
  const dupes = new Map<number, number>();
  names.forEach((raw, i) => {
    const key = matchKey(raw);
    if (!key) return;
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    else dupes.set(i, first);
  });
  return dupes;
}
