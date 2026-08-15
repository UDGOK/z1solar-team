/**
 * Pulls candidate action items out of pasted meeting notes or a transcript.
 *
 * Deliberately rule-based rather than AI: it's deterministic, free, runs
 * instantly, and — most importantly — every suggestion is shown for review
 * before anything is created. A confident-but-wrong AI extraction that
 * silently assigns work to the wrong person is worse than no extraction, so
 * the design optimises for "obvious when it's wrong" over "clever".
 *
 * Each result carries the reason it was flagged, so a bad match is visible
 * rather than mysterious.
 */

export type Extracted = {
  text: string;
  matchedNames: string[];
  dueDate: Date | null;
  reason: string;
  confidence: "high" | "medium" | "low";
  sourceLine: number;
};

/**
 * Alternate spellings and nicknames seen in real meeting notes. Without this,
 * a section headed "@Zakir" assigns to nobody even though Syed is on the team.
 * Keys are lowercase; values must match a roster name (also compared lowercase).
 */
export const NAME_ALIASES: Record<string, string> = {
  zakir: "syed",
  "zakir bhai": "syed",
  yasser: "yasir",
  muhammad: "mohammad",
  mohamed: "mohammad",
  mohammed: "mohammad",
  muzz: "mohammad",
  javed: "javaid",
  "javed bhai": "javaid",
  "shahab bhai": "shahab",
  "shah": "shahab",
};

/** Explicit markers people actually type in notes. */
const EXPLICIT = [
  /^\s*(?:action|action item|ai|todo|to-do|task|next step)s?\s*[:\-–]\s*(.+)$/i,
  /^\s*[-*•]?\s*\[\s*[xX ]?\s*\]\s*(.+)$/,   // - [ ] / [x] markdown checkbox
  /^\s*(?:☐|□)\s*(.+)$/,
];

/** "Ryan will order the unit", "Ali to send specs", "Ken needs to confirm" */
const COMMITMENT =
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:will|to|should|must|needs? to|is going to|agreed to|has to|"?ll)\s+(.{4,200}?)(?:\.|$)/;

/** Lines that look like discussion, not commitments. */
const NOISE =
  /^\s*(?:attendees?|present|apologies|agenda|minutes|notes|date|time|location|recording|transcript)\s*[:\-–]/i;

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

/**
 * Finds a due date in free text. Returns null rather than guessing — a wrong
 * date is worse than an empty one the reviewer fills in.
 */
export function extractDueDate(text: string, from = new Date()): Date | null {
  const t = text.toLowerCase();
  const base = new Date(from);
  base.setHours(17, 0, 0, 0); // default to end of business day

  if (/\b(?:eod|end of day|today)\b/.test(t)) return base;

  // A deadline column often holds just the word: "[Sunday]", "[Weekend]".
  // Handled before the "by <day>" pattern because there's no preposition.
  const bare = t.trim().match(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday|weekend)$/);
  if (bare) {
    const d = new Date(base);
    const target = bare[1] === "weekend" ? 6 : DAYS.indexOf(bare[1]);
    let delta = (target - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    d.setDate(d.getDate() + delta);
    return d;
  }

  if (/\btomorrow\b/.test(t)) {
    const d = new Date(base); d.setDate(d.getDate() + 1); return d;
  }

  // "by Friday" / "next Tuesday"
  const dayMatch = t.match(/\b(?:by|before|on|next|this)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (dayMatch) {
    const target = DAYS.indexOf(dayMatch[1]);
    const d = new Date(base);
    let delta = (target - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7;                    // "by Friday" on a Friday means next one
    if (/\bnext\b/.test(dayMatch[0])) delta += 7;
    d.setDate(d.getDate() + delta);
    return d;
  }

  if (/\b(?:end of|by end of|eow|end of week)\b.*\bweek\b|\beow\b/.test(t)) {
    const d = new Date(base);
    d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
    return d;
  }
  if (/\bnext week\b/.test(t)) { const d = new Date(base); d.setDate(d.getDate() + 7); return d; }

  // "in 3 days" / "in 2 weeks"
  const inMatch = t.match(/\bin\s+(\d{1,2})\s+(day|week|month)s?\b/);
  if (inMatch) {
    const n = Number(inMatch[1]); const d = new Date(base);
    if (inMatch[2] === "day") d.setDate(d.getDate() + n);
    if (inMatch[2] === "week") d.setDate(d.getDate() + n * 7);
    if (inMatch[2] === "month") d.setMonth(d.getMonth() + n);
    return d;
  }

  // "by Sept 15", "by September 15th"
  const monMatch = t.match(
    /\b(?:by|before|on|due)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/
  );
  if (monMatch) {
    const idx = MONTHS.findIndex((m) => m.startsWith(monMatch[1] === "sept" ? "sep" : monMatch[1]));
    if (idx >= 0) {
      const d = new Date(base);
      d.setMonth(idx, Number(monMatch[2]));
      if (d < from) d.setFullYear(d.getFullYear() + 1);   // a past date means next year
      return d;
    }
  }

  // "by 9/15" or "9/15/26"
  const slash = t.match(/\b(?:by|before|on|due)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const d = new Date(base);
    const yr = slash[3] ? (slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3])) : d.getFullYear();
    d.setFullYear(yr, Number(slash[1]) - 1, Number(slash[2]));
    if (!slash[3] && d < from) d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  return null;
}

/** Matches names mentioned in a line against the real team roster. */
function findNames(line: string, roster: { id: string; name: string }[]): { id: string; name: string }[] {
  const hits: { id: string; name: string }[] = [];

  // Resolve nicknames first: "Zakir" -> "syed", so the roster match below finds
  // the real person.
  const lower = line.toLowerCase();
  for (const [alias, real] of Object.entries(NAME_ALIASES)) {
    if (new RegExp(`(?:^|[^a-z])@?${escapeRe(alias)}\\b`, "i").test(lower)) {
      const person = roster.find((r) => r.name.toLowerCase().startsWith(real));
      if (person && !hits.some((h) => h.id === person.id)) hits.push(person);
    }
  }

  for (const person of roster) {
    const first = person.name.split(/\s+/)[0];
    // Word-boundary match on either the full name or the first name, so
    // "Ryan" matches "Ryan Chen" but "Ryanair" doesn't match anything.
    const full = new RegExp(`\\b${escapeRe(person.name)}\\b`, "i");
    const firstOnly = new RegExp(`(?:^|[^a-z])@?${escapeRe(first)}\\b`, "i");
    if (full.test(line) || firstOnly.test(line)) hits.push({ id: person.id, name: person.name });
  }
  // De-dupe by id (someone could match on both patterns).
  return hits.filter((h, i) => hits.findIndex((x) => x.id === h.id) === i);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractActionItems(
  raw: string,
  roster: { id: string; name: string }[],
  now = new Date()
): Extracted[] {
  const lines = raw.split(/\r?\n/);
  const out: Extracted[] = [];

  // Real notes group tasks under a person's heading — "### @Zakir" followed by
  // several "- [ ]" lines. The name never appears in the task line itself, so
  // without tracking the current section every one of those items would end up
  // unassigned. This is the single most important thing the parser does on
  // real-world notes.
  let sectionOwners: { id: string; name: string }[] = [];

  lines.forEach((rawLine, i) => {
    // Heading that names a person: "### @Zakir", "## Yasir", "**@Ryan**"
    const heading = rawLine.match(/^\s*(?:#{1,6}\s*|\*\*)\s*@?([A-Za-z][A-Za-z .()'-]{1,40}?)(?:\s*\(.*?\))?\s*\**\s*:?\s*$/);
    if (heading) {
      const label = heading[1].trim();
      if (/^(all team members|team|everyone|all)$/i.test(label)) {
        sectionOwners = [];        // group action — leave for the reviewer to assign
      } else {
        const found = findNames(label, roster);
        // Only switch owner if the heading actually names someone we know;
        // otherwise it's a topic heading like "## Action Items".
        if (found.length) sectionOwners = found;
        else if (/^(action items?|notes?|summary|agenda|decisions?)$/i.test(label)) sectionOwners = [];
      }
      return;
    }
    // Strip transcript speaker labels and timestamps: "[00:14:22] Yasir: ..."
    let line = rawLine
      .replace(/^\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/, "")
      .replace(/^\s*[-*•]\s*/, "")
      .trim();
    if (line.length < 8) return;
    if (NOISE.test(line)) return;

    let text = line;
    let reason = "";
    let confidence: Extracted["confidence"] = "low";

    // Speaker prefix, e.g. "Yasir: Ryan will order the unit"
    const speaker = line.match(/^([A-Z][a-zA-Z .]{1,28}):\s*(.+)$/);
    const afterSpeaker = speaker ? speaker[2] : line;

    let matched = false;
    for (const re of EXPLICIT) {
      const m = line.match(re);
      if (m) {
        text = m[1].trim();
        reason = "Explicitly marked as an action item";
        confidence = "high";
        matched = true;
        break;
      }
    }

    if (!matched) {
      const c = afterSpeaker.match(COMMITMENT);
      if (c) {
        text = c[0].trim();
        reason = `"${c[1]}" committed to something`;
        confidence = "high";
        matched = true;
      }
    }

    // A bare @mention with a verb is a weaker signal but worth surfacing.
    if (!matched && /@[A-Za-z]/.test(line) && /\b(?:send|order|check|confirm|call|email|review|follow up|get|pull|schedule|book)\b/i.test(line)) {
      text = afterSpeaker;
      reason = "Mentions someone alongside an action verb";
      confidence = "medium";
      matched = true;
    }

    if (!matched) return;

    // A trailing "- [TBD]" / "- [Monday]" is the deadline column in this
    // style of notes. Pull it out before it pollutes the task wording.
    let dueTag: string | null = null;
    const tag = text.match(/\s*[-–]\s*\[([^\]]{1,30})\]\s*$/);
    if (tag) {
      dueTag = tag[1].trim();
      text = text.slice(0, tag.index).trim();
    }

    const inline = findNames(text.length < line.length ? line : text, roster);
    // Under a person's heading the heading IS the assignment. Names inside the
    // line are usually recipients ("share leads with Ryan and Muhammad"), not
    // the owner — so the section wins whenever we're in one.
    const names = sectionOwners.length ? sectionOwners : inline;

    const dueSource = dueTag && !/^tbd$/i.test(dueTag) ? dueTag : line;
    const dueDate = extractDueDate(dueSource, now);

    // No name at all makes it much less likely to be a real assignment.
    if (names.length === 0 && confidence === "high") confidence = "medium";
    if (names.length === 0 && confidence === "medium") confidence = "low";

    out.push({
      text: cleanup(text),
      matchedNames: names.map((n) => n.name),
      dueDate,
      reason: reason + (names.length ? ` · matched ${names.map((n) => n.name).join(", ")}` : " · no name matched"),
      confidence,
      sourceLine: i + 1,
    });
  });

  // De-duplicate near-identical lines (transcripts repeat a lot).
  const seen = new Set<string>();
  return out.filter((x) => {
    const key = x.text.toLowerCase().replace(/\W+/g, " ").trim().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Tidies an extracted line into something that reads like a task. */
function cleanup(t: string) {
  return t
    .replace(/\s+/g, " ")
    .replace(/^(?:and|so|then|ok|okay|right)\s+/i, "")
    .replace(/[.,;]+$/, "")
    .trim()
    .slice(0, 300);
}

/** Resolves suggested names back to member ids for the review screen. */
export function namesToIds(names: string[], roster: { id: string; name: string }[]): string[] {
  return names
    .map((n) => roster.find((r) => r.name.toLowerCase() === n.toLowerCase())?.id)
    .filter((x): x is string => !!x);
}
