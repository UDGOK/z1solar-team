/**
 * Maps the columns of somebody else's spreadsheet onto our fields.
 *
 * Every show portal names its columns differently — "Exhibitor Name", "Company",
 * "Organisation", "Account Name" all mean the same thing. Guessing well covers
 * most of it; the review screen shows every guess with a real value from the
 * file beside it so a wrong guess is obvious rather than mysterious.
 */

export type FieldKey =
  | "companyName"
  | "booth"
  | "hall"
  | "websiteUrl"
  | "description"
  | "tagNames"
  | "contactName"
  | "contactEmail"
  | "hqCountry"
  | "listing"
  | "sponsorTier"
  | "sector"
  | "reputationScore"
  | "riskNotes"
  | "ignore";

export const FIELD_LABELS: Record<FieldKey, string> = {
  companyName: "Company name",
  booth: "Booth",
  hall: "Hall / pavilion",
  websiteUrl: "Website",
  description: "What they do",
  tagNames: "Tags",
  contactName: "Contact name",
  contactEmail: "Contact email",
  hqCountry: "HQ country",
  listing: "Exhibitor / sponsor",
  sponsorTier: "Sponsor tier",
  sector: "Sector (raw category)",
  reputationScore: "Reputation score",
  riskNotes: "Risk notes",
  ignore: "— ignore —",
};

/**
 * Header patterns, most specific first. Order matters: "company profile" must
 * be tested before "company", or a description column gets mapped as the name.
 */
const HEADER_PATTERNS: { field: FieldKey; patterns: RegExp[] }[] = [
  {
    field: "description",
    patterns: [
      /company\s*(profile|description|bio|blurb|overview|summary)/i,
      /\b(profile|description|about|overview|blurb|summary|what\s*they\s*do)\b/i,
    ],
  },
  {
    field: "contactEmail",
    patterns: [/e-?mail/i, /\bcontact\s*e-?mail\b/i],
  },
  {
    field: "contactName",
    patterns: [/contact\s*(name|person)/i, /^contact$/i, /\brepresentative\b/i],
  },
  {
    field: "websiteUrl",
    patterns: [/\b(website|web\s*site|url|homepage|www|web\s*address|link)\b/i],
  },
  {
    field: "booth",
    patterns: [/\b(booth|stand|stall)\s*(#|no\.?|number|num)?\b/i, /^(booth|stand)$/i],
  },
  {
    field: "hall",
    patterns: [/\b(hall|pavilion|pavillion|zone|area|section|location|floor)\b/i],
  },
  {
    field: "sponsorTier",
    patterns: [/\b(sponsor(ship)?\s*(level|tier|type)|tier|level|package)\b/i],
  },
  {
    field: "listing",
    patterns: [/\b(listing|record\s*type|exhibitor\s*type|participation|type)\b/i],
  },
  {
    field: "reputationScore",
    patterns: [/reputation|\bscore\b|rating|standing/i],
  },
  {
    field: "riskNotes",
    patterns: [/risk\s*(assessment|notes?|comments?)?/i],
  },
  {
    field: "sector",
    patterns: [/^(sector|industry|category)$/i, /\braw\s*categor/i],
  },
  {
    field: "tagNames",
    patterns: [
      /\b(categor(y|ies)|tags?|sector|industry|segment|product\s*type|solutions?)\b/i,
    ],
  },
  {
    field: "hqCountry",
    patterns: [/\b(country|nation|hq\s*country|headquarters)\b/i],
  },
  {
    field: "companyName",
    patterns: [
      /\b(exhibitor|company|organisation|organization|account|business|firm|vendor|supplier)\s*(name)?\b/i,
      /^name$/i,
    ],
  },
];

/** Guesses a field for one header cell. Returns "ignore" when unsure. */
export function guessField(header: string): FieldKey {
  const h = String(header || "").trim();
  if (!h) return "ignore";
  for (const { field, patterns } of HEADER_PATTERNS) {
    if (patterns.some((p) => p.test(h))) return field;
  }
  return "ignore";
}

/**
 * Guesses the whole header row.
 *
 * Each field is claimed at most once — if two columns both look like the
 * company name, the first wins and the second is left for a human to assign.
 * Silently mapping both would mean one column overwrites the other with no
 * indication that it happened.
 */
export function guessColumnMap(headers: string[]): FieldKey[] {
  const taken = new Set<FieldKey>();
  const out: FieldKey[] = [];

  for (const h of headers) {
    const guess = guessField(h);
    if (guess === "ignore" || taken.has(guess)) {
      out.push("ignore");
    } else {
      taken.add(guess);
      out.push(guess);
    }
  }

  // A file with no recognisable name column is still importable: assume the
  // first UNCLAIMED column is the company, which holds for every plain list
  // we've seen, and let the reviewer correct it if not.
  //
  // "Unclaimed" matters. This used to take the first non-empty column outright,
  // which quietly destroyed a correct guess: given headers like
  // ["Stand Ref", "Zone Code", ...] it overwrote the booth mapping AND named
  // the booth column as the company — one wrong guess producing two wrong
  // fields. Better to leave companyName unset and let the mapping screen insist
  // on a choice than to be confidently wrong.
  if (!taken.has("companyName")) {
    const idx = out.findIndex(
      (field, i) => field === "ignore" && String(headers[i] || "").trim() !== ""
    );
    if (idx >= 0) out[idx] = "companyName";
  }

  return out;
}

/**
 * Decides whether the first row is a header or already data.
 *
 * Pasted lists frequently arrive with no header at all, and treating the first
 * exhibitor as column titles quietly loses a company.
 */
export function looksLikeHeaderRow(row: string[]): boolean {
  const cells = row.map((c) => String(c || "").trim()).filter(Boolean);
  if (cells.length === 0) return false;
  // Header cells are short, wordy, and don't look like URLs or booth codes.
  const headerish = cells.filter(
    (c) =>
      c.length <= 40 &&
      !/^https?:\/\//i.test(c) &&
      !/^[A-Z]?\d{3,}$/.test(c) &&
      !/@/.test(c)
  ).length;
  if (headerish / cells.length < 0.7) return false;
  // At least one cell should match a known header word.
  return cells.some((c) => guessField(c) !== "ignore");
}

export type RawRow = {
  companyName: string;
  booth?: string;
  hall?: string;
  websiteUrl?: string;
  description?: string;
  tagNames?: string;
  contactName?: string;
  contactEmail?: string;
  hqCountry?: string;
  listing?: string;
  sponsorTier?: string;
  sector?: string;
  reputationScore?: string;
  riskNotes?: string;
  sourceLine: number;
};

/** Normalises a URL that arrived bare ("nextracker.com") or with tracking noise. */
export function normaliseUrl(raw?: string): string | undefined {
  const s = String(raw || "").trim();
  if (!s) return undefined;
  if (/^(n\/?a|none|-|—)$/i.test(s)) return undefined;
  let url = s;
  if (!/^https?:\/\//i.test(url)) {
    // Only add a scheme to something that actually looks like a host.
    if (!/^[\w-]+(\.[\w-]+)+/.test(url)) return undefined;
    url = "https://" + url;
  }
  try {
    const u = new URL(url);
    return u.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

/** Applies a column map to the data rows, producing our shape. */
export function applyColumnMap(
  rows: string[][],
  map: FieldKey[],
  firstDataLine: number
): RawRow[] {
  const out: RawRow[] = [];

  rows.forEach((cells, i) => {
    const rec: Record<string, string> = {};
    map.forEach((field, col) => {
      if (field === "ignore") return;
      const val = String(cells[col] ?? "").trim();
      if (!val) return;
      // Multiple source columns can legitimately feed one field (two category
      // columns, say) — join rather than overwrite.
      rec[field] = rec[field] ? `${rec[field]}, ${val}` : val;
    });

    const companyName = (rec.companyName || "").trim();
    if (!companyName) return; // a row with no company is not an exhibitor

    out.push({
      companyName,
      booth: rec.booth || undefined,
      hall: rec.hall || undefined,
      websiteUrl: normaliseUrl(rec.websiteUrl),
      description: rec.description || undefined,
      tagNames: rec.tagNames || undefined,
      contactName: rec.contactName || undefined,
      contactEmail: rec.contactEmail || undefined,
      hqCountry: rec.hqCountry || undefined,
      listing: rec.listing || undefined,
      sponsorTier: rec.sponsorTier || undefined,
      sector: rec.sector || undefined,
      reputationScore: rec.reputationScore || undefined,
      riskNotes: rec.riskNotes || undefined,
      sourceLine: firstDataLine + i,
    });
  });

  return out;
}
