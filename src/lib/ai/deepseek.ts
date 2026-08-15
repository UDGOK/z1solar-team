import type { Extracted } from "../meetingExtract";

/**
 * AI-assisted extraction via DeepSeek.
 *
 * Deliberately an ENHANCEMENT, never a replacement. The rule-based extractor
 * runs first and always succeeds; this adds items rules can't see (implicit
 * commitments, messy transcript phrasing) and writes a summary.
 *
 * Every failure path returns null so the caller keeps its rule-based result —
 * a third-party API having a bad minute must never leave someone staring at an
 * empty screen, and must never block the import.
 */

const API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";
const TIMEOUT_MS = 45_000;

export type AiResult = {
  summary: string | null;
  decisions: string[];
  items: {
    text: string;
    assigneeNames: string[];
    dueText: string | null;
    reason: string;
  }[];
};

export function isAiConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

/**
 * Asks DeepSeek for action items, decisions and a summary.
 * Returns null on any failure — caller falls back to rules only.
 */
export async function aiExtract(
  rawText: string,
  roster: { id: string; name: string }[]
): Promise<AiResult | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  if (!rawText.trim()) return null;

  // Long transcripts: keep the request bounded rather than sending 200KB.
  const text = rawText.length > 40_000 ? rawText.slice(0, 40_000) + "\n[truncated]" : rawText;
  const names = roster.map((r) => r.name).join(", ");

  const system = [
    "You extract action items from meeting notes for a solar and data-centre construction company.",
    "",
    "Rules you must follow:",
    "- Only report commitments that were ACTUALLY made. Never invent or infer work that wasn't stated.",
    "- Assignees must be chosen from this exact team roster: " + names,
    "- If no one on the roster was clearly named for an item, return an empty assigneeNames array. Do NOT guess.",
    "- dueText must be the literal deadline wording from the notes (e.g. \"by Friday\", \"Sept 1\"), or null.",
    "- reason: one short phrase quoting or paraphrasing why you flagged it.",
    "- decisions: things the group agreed or concluded, not tasks.",
    "- summary: 2-4 sentences on what the meeting covered.",
    "",
    "Respond with ONLY valid JSON, no markdown fences, in exactly this shape:",
    '{"summary":"...","decisions":["..."],"items":[{"text":"...","assigneeNames":["..."],"dueText":"...","reason":"..."}]}',
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: text },
        ],
        temperature: 0.1, // low: extraction, not creativity
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error("[ai extract] DeepSeek returned", res.status);
      return null;
    }

    const data: any = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const cleaned = content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // Validate defensively — a model can return well-formed JSON with the
    // wrong shape, and we'd rather fall back than crash the import.
    const rosterLower = new Set(roster.map((r) => r.name.toLowerCase()));
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter((i: any) => typeof i?.text === "string" && i.text.trim().length > 3)
          .slice(0, 40)
          .map((i: any) => ({
            text: String(i.text).trim().slice(0, 300),
            // Drop any name the model invented that isn't on the real roster.
            assigneeNames: Array.isArray(i.assigneeNames)
              ? i.assigneeNames.filter((n: any) => typeof n === "string" && rosterLower.has(n.toLowerCase()))
              : [],
            dueText: typeof i.dueText === "string" && i.dueText.trim() ? i.dueText.trim().slice(0, 60) : null,
            reason: typeof i.reason === "string" ? i.reason.slice(0, 160) : "Identified by AI",
          }))
      : [];

    return {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 2000) : null,
      decisions: Array.isArray(parsed.decisions)
        ? parsed.decisions.filter((d: any) => typeof d === "string" && d.trim()).slice(0, 20).map((d: string) => d.trim().slice(0, 300))
        : [],
      items,
    };
  } catch (e: any) {
    if (e?.name === "AbortError") console.error("[ai extract] timed out");
    else console.error("[ai extract] failed:", e?.message ?? e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Merges AI findings into rule-based ones.
 *
 * Rule results win on conflict — they're deterministic and traceable to an
 * exact line. AI items are added only when they're genuinely new, and are
 * tagged so a reviewer can see where each suggestion came from.
 */
export function mergeExtractions(
  ruleItems: Extracted[],
  ai: AiResult | null,
  roster: { id: string; name: string }[],
  parseDue: (t: string) => Date | null
): Extracted[] {
  // Defensive: a malformed payload must never crash an import.
  if (!ai || !Array.isArray(ai.items) || ai.items.length === 0) return ruleItems;

  const norm = (s: string) =>
    s
      .toLowerCase()
      // Drop a leading "Name - " / "Name:" prefix. The rule extractor keeps it
      // ("Muhammad - confirm 208V…") while AI usually strips it ("Confirm
      // 208V…"), and without normalising both the same task appears twice.
      .replace(/^[a-z][a-z .'-]{1,30}\s*[-–:]\s*/, "")
      .replace(/\W+/g, " ")
      .trim();

  /** Word-overlap similarity, so near-identical phrasings collapse. */
  const similar = (a: string, b: string) => {
    if (!a || !b) return false;
    if (a === b || a.includes(b) || b.includes(a)) return true;
    const wa = new Set(a.split(" ").filter((w) => w.length > 3));
    const wb = new Set(b.split(" ").filter((w) => w.length > 3));
    if (wa.size === 0 || wb.size === 0) return false;
    let shared = 0;
    wa.forEach((w) => { if (wb.has(w)) shared++; });
    return shared / Math.min(wa.size, wb.size) >= 0.75;
  };

  const existing = ruleItems.map((r) => norm(r.text));
  // Re-validate names here as well as in aiExtract. Filtering in one place
  // only would mean any other caller could let a hallucinated assignee
  // through, which is the single worst failure mode for this feature.
  const rosterLower = new Set(roster.map((r) => r.name.toLowerCase()));

  const added: Extracted[] = [];
  for (const item of ai.items) {
    if (!item || typeof item.text !== "string") continue;
    const text = item.text.trim();
    if (text.length < 4) continue;

    const key = norm(text);
    if (!key) continue;
    if (existing.some((e) => similar(e, key))) continue;
    existing.push(key);

    const names = Array.isArray(item.assigneeNames)
      ? item.assigneeNames.filter((n) => typeof n === "string" && rosterLower.has(n.toLowerCase()))
      : [];

    added.push({
      text,
      matchedNames: names,
      dueDate: typeof item.dueText === "string" && item.dueText ? parseDue(item.dueText) : null,
      reason: `AI: ${typeof item.reason === "string" ? item.reason : "identified by AI"}`,
      // AI-only items start at medium so they're reviewed, never auto-trusted —
      // and drop to low with no confirmed assignee.
      confidence: names.length ? "medium" : "low",
      sourceLine: 0,
    });
  }

  return [...ruleItems, ...added];
}
