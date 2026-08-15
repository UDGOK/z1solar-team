/**
 * Maps a show's free-text Category value onto our curated tag list.
 *
 * The Datacloud attendee list carries 262 distinct categories, 147 of which
 * appear exactly once ("Modular Data Center Manufacturing", "Subsea Cable
 * Systems", "Water Treatment"). Turning those into tags produces a filter bar
 * nobody can use, so they are folded into the 20 tags seeded in Settings.
 *
 * Rules are keyword-based rather than an enumerated 262-row table, because the
 * next show will have a different 262 and a hand-written table would cover none
 * of them.
 *
 * ORDER MATTERS. The first rule that matches wins, so the specific ones come
 * first: "Data Center Cooling" must reach the Cooling rule before the Data
 * Centre rule claims it.
 *
 * The raw category text is always preserved on the vendor as well — mapping is
 * for filtering, never a substitute for what the source actually said.
 */

export type TagRule = { tag: string; patterns: RegExp[] };

export const CATEGORY_RULES: TagRule[] = [
  // --- specific equipment first ---
  { tag: "Cooling", patterns: [/cool|hvac|thermal|chill|crac|liquid immersion|immersion/i] },
  { tag: "BESS", patterns: [/battery|\bstorage\b|bess/i] },
  { tag: "Inverters", patterns: [/inverter|\bpcs\b|power conversion|rectifier|power electronic/i] },
  { tag: "Modules", patterns: [/\bpv\b|photovoltaic|\bsolar\b/i] },
  { tag: "Trackers", patterns: [/tracker|single.?axis/i] },
  { tag: "Racking", patterns: [/racking|mounting|rack system|structural mount/i] },
  { tag: "Switchgear", patterns: [/switchgear|busway|busduct|distribution board|\bups\b|power distribution|grid infra|transmission/i] },
  { tag: "Transformers", patterns: [/transformer|substation/i] },
  {
    tag: "Generation",
    patterns: [
      /generat|turbine|\bchp\b|cogen|fuel cell|nuclear|\bsmr\b|microgrid|genset|diesel|gas engine/i,
      /renewable|\bwind\b|geothermal|hydrogen|\benergy\b/i,
    ],
  },
  { tag: "BOS", patterns: [/\bbos\b|ebos|cable|wire|conduit|connector|harness|combiner|busbar/i] },

  // --- fibre / telecom before generic infrastructure ---
  {
    tag: "Fibre & Telecom",
    patterns: [
      /fiber|fibre|telecom|optical|network equipment|subsea|dark fib|carrier|wireless|5g|satellite|isp\b/i,
      /broadband|network (infrastructure|services|solutions)|connectivity|\bit infrastructure\b/i,
    ],
  },

  // --- services ---
  { tag: "EPC", patterns: [/\bepc\b|construction|contractor|civil works|general contract|installation/i] },
  { tag: "O&M", patterns: [/o&m|operations? (and|&) maintenance|maintenance|facility management|commissioning|testing/i] },
  { tag: "Engineering", patterns: [/engineering|design build|architect|surveying/i] },
  { tag: "Legal", patterns: [/legal|law firm|attorney|counsel|litigation|compliance/i] },
  {
    tag: "Financing",
    patterns: [
      /invest|financ|capital|bank|private equity|fund|credit|lending|tax equity|\bm&a\b|advisory firm|insurance|broker/i,
      /trading|asset management|\breit\b/i,
    ],
  },
  {
    tag: "Consulting",
    patterns: [/consult|advisor|research|analyst|market intel|recruit|staffing|talent|training|marketing|\bpr\b|media/i],
  },
  { tag: "Software", patterns: [/software|\bsaas\b|platform|\bdcim\b|monitoring|automation|analytics|cyber|\bit services\b|managed services/i] },

  // --- data centre last: it is the broadest bucket on a digital-infra list ---
  {
    tag: "Data Centre",
    patterns: [
      /data cent|colocation|colo\b|hyperscale|cloud|\bai\b|compute|hosting|edge|real estate|\breit\b|land/i,
      /artificial intelligence|machine learning|blockchain|crypto|\bhpc\b/i,
    ],
  },

  // --- what kind of company, if nothing above stuck ---
  {
    tag: "Manufacturer",
    patterns: [
      /manufactur|equipment|supplier|product|fabricat|steel|concrete|modular|prefab/i,
      /building material|industrial (supply|valve|product)|semiconductor|fire protection|\bvalve|piping/i,
    ],
  },
  { tag: "Developer", patterns: [/develop|operator|owner|utility|\bipp\b|asset owner|^infrastructure$/i] },
];

/**
 * Returns the curated tag names for a raw category string.
 *
 * A category can legitimately hit more than one tag ("Data Center Cooling" is
 * both), so all matching rules are returned rather than only the first. Capped
 * at three: past that a company is tagged with so much that filtering by any
 * one tag stops meaning anything.
 */
export function tagsForCategory(raw: string | null | undefined, max = 3): string[] {
  const s = String(raw || "").trim();
  if (!s) return [];

  const hits: string[] = [];
  for (const rule of CATEGORY_RULES) {
    if (hits.length >= max) break;
    if (rule.patterns.some((p) => p.test(s))) hits.push(rule.tag);
  }
  return hits;
}

/** Maps a whole comma/semicolon-separated Category cell. */
export function tagsForCategoryCell(cell: string | null | undefined, max = 3): string[] {
  const parts = String(cell || "")
    .split(/[,;/|]/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const p of parts) {
    for (const t of tagsForCategory(p, max)) {
      if (!out.includes(t)) out.push(t);
      if (out.length >= max) return out;
    }
  }
  return out;
}
