/**
 * DeepSeek assessment of a vendor's standing.
 *
 * WHAT THIS IS, AND WHAT IT ISN'T
 * This is a language model's impression of a company from its training data. It
 * is NOT research, it has no sources, and it cannot see anything that happened
 * recently. Everything it produces is stored with riskSource="ai" and shown to
 * the team behind an "unverified" label, because an unsourced judgement about a
 * named company is worse than no judgement — six months on nobody remembers
 * which numbers someone checked and which a model guessed.
 *
 * Two failure modes are designed around specifically:
 *
 * 1. GRADE INFLATION. Asked to rate companies it half-recognises, a model
 *    regresses to "probably fine" — the list this replaces scored 100 companies
 *    with nothing below 65. The prompt therefore demands the FULL range and
 *    requires an explicit "unknown" verdict rather than a polite number.
 *
 * 2. INVENTED SPECIFICS. "Reports of delayed parts shipping" reads as fact and
 *    is indistinguishable from one. The prompt forbids specific claims —
 *    incidents, lawsuits, financial trouble — unless they are genuinely
 *    well-known, and `confidence` lets the reviewer discard the rest.
 *
 * Nothing here writes to the database. Results go into the import review table
 * and a human confirms them, exactly like every other AI output in this app.
 */

const API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";
const TIMEOUT_MS = 60_000;
/** Companies per request. Small enough to stay coherent, large enough to be cheap. */
export const SCORE_BATCH_SIZE = 12;

export type VendorScoreInput = {
  id: string;
  name: string;
  description?: string | null;
  sector?: string | null;
  hqCountry?: string | null;
};

export type VendorScore = {
  id: string;
  /** 0-100, or null when the model doesn't recognise the company at all. */
  score: number | null;
  notes: string | null;
  /** high | medium | low — how well the model claims to know this company. */
  confidence: "high" | "medium" | "low";
};

export type ScoreBatchResult = {
  scores: VendorScore[];
  error: string | null;
};

const SYSTEM = [
  "You assess suppliers and counterparties for a solar, battery storage and data-centre developer.",
  "For each company you are given, judge how comfortable a buyer should be engaging with them.",
  "",
  "SCORING — use the whole range. Most real lists are not uniformly good.",
  "  85-100  Major established firm, long track record, no meaningful concerns.",
  "  70-84   Solid and known, ordinary commercial risk.",
  "  50-69   Small, young, narrow, or you know little beyond that it exists.",
  "  25-49   Real concerns you are confident about, or very thin substance.",
  "  0-24    Serious well-documented problems.",
  "  null    You do not recognise this company. Say so.",
  "",
  "HARD RULES:",
  "- If you do not genuinely recognise a company, set score to null and confidence to \"low\".",
  "  Returning a polite mid-range number for an unknown company is the single worst thing",
  "  you can do here, because it is indistinguishable from a real assessment.",
  "- Do NOT invent specifics. No lawsuits, incidents, delivery problems, financial trouble or",
  "  customer complaints unless they are genuinely well known and you are confident.",
  "- notes: at most 20 words, describing what the company IS and any real concern.",
  "  If you have no concern, say what they do and stop. Do not pad.",
  "- confidence reflects how well you know THIS company, not how sure you are of the number.",
  "- Never mention that you are an AI or that this is an estimate. The label is applied elsewhere.",
  "",
  "Respond with ONLY valid JSON, no markdown fences, in exactly this shape:",
  '{"results":[{"id":"...","score":85,"notes":"...","confidence":"high"}]}',
].join("\n");

export function isVendorScoringConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

/**
 * Scores one batch. Returns an error string rather than throwing so a single
 * bad batch degrades that batch only — the rest of an 800-company run continues.
 */
export async function scoreVendorBatch(
  vendors: VendorScoreInput[]
): Promise<ScoreBatchResult> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { scores: [], error: "DEEPSEEK_API_KEY is not set." };
  if (vendors.length === 0) return { scores: [], error: null };

  const payload = vendors.map((v) => ({
    id: v.id,
    name: v.name,
    // Trimmed: the profile is the useful signal, but a 500-word blurb per
    // company blows the context for no extra accuracy.
    about: (v.description ?? "").slice(0, 240) || undefined,
    sector: v.sector ?? undefined,
    country: v.hqCountry ?? undefined,
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify({ companies: payload }) },
        ],
        // Low but not zero: deterministic enough to be reproducible, without
        // collapsing every company onto the same number.
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { scores: [], error: `DeepSeek returned ${res.status}. ${body.slice(0, 200)}` };
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return { scores: [], error: "Empty response from DeepSeek." };

    const parsed = safeParse(content);
    if (!parsed) return { scores: [], error: "DeepSeek returned something that wasn't valid JSON." };

    const known = new Set(vendors.map((v) => v.id));
    const scores: VendorScore[] = [];

    for (const r of Array.isArray(parsed.results) ? parsed.results : []) {
      // Ignore anything for a company we didn't ask about — a hallucinated id
      // must never create or touch a vendor.
      if (!r || typeof r.id !== "string" || !known.has(r.id)) continue;

      let score: number | null = null;
      if (typeof r.score === "number" && Number.isFinite(r.score)) {
        score = Math.max(0, Math.min(100, Math.round(r.score)));
      }

      const confidence: VendorScore["confidence"] =
        r.confidence === "high" || r.confidence === "medium" ? r.confidence : "low";

      // A low-confidence numeric score is exactly the grade inflation this is
      // meant to prevent — drop the number, keep the note.
      const finalScore = confidence === "low" ? null : score;

      scores.push({
        id: r.id,
        score: finalScore,
        notes: typeof r.notes === "string" && r.notes.trim() ? r.notes.trim().slice(0, 300) : null,
        confidence,
      });
    }

    return { scores, error: null };
  } catch (e: any) {
    if (e?.name === "AbortError") return { scores: [], error: "DeepSeek timed out." };
    return { scores: [], error: e?.message ?? "DeepSeek request failed." };
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    // Some models wrap JSON in ``` fences despite being told not to.
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}
