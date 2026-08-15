/**
 * One place that decides how time is displayed.
 *
 * THE PROBLEM THIS SOLVES
 * The app renders in three different timezones depending on where the code
 * runs: UTC on Vercel's servers, whatever the browser is set to on the client,
 * and America/Chicago in the heads of the people using it. Formatting a date
 * without saying which one you meant produces a value that changes depending on
 * who is looking, which is how a trade show entered as 1–3 September came to
 * display as "Aug 31 – Sep 2" for anyone west of UTC.
 *
 * THE RULE: THERE ARE TWO KINDS OF TIME, AND THEY ARE NOT THE SAME
 *
 *   1. CALENDAR DATES — a trade show's start date, a registration deadline, a
 *      task due date. These are a square on a calendar. They have no time of
 *      day. They arrive from <input type="date"> as "2026-09-01" and are stored
 *      as UTC midnight.
 *      => Format with formatDate(). It reads them in UTC, because that's the
 *         timezone they were written in. Reading UTC midnight in Central gives
 *         7pm the PREVIOUS DAY — the off-by-one above.
 *
 *   2. INSTANTS — createdAt, a meeting's startsAt, when a text arrived, when
 *      someone was last seen. These are a real moment in time, and the question
 *      "what time was that?" has a different answer in every timezone.
 *      => Format with formatDateTime() / formatTime(). They render in Central,
 *         because this is a Tulsa company and the answer everyone wants is
 *         "what time was it here?"
 *
 * Getting these the wrong way round is silent: a calendar date shown in Central
 * is a day early, and an instant shown in UTC is five hours out. Neither throws.
 * If you are unsure which kind you have, look at where the value came from — a
 * date picker is a calendar date, `now()` is an instant.
 *
 * These helpers are safe in server components, client components and route
 * handlers, and produce identical output in all three, which also removes a
 * whole class of React hydration mismatch.
 */

/** The company's operating timezone. Everything instant-shaped renders here. */
export const BUSINESS_TZ = "America/Chicago";

/** Shown next to times so nobody has to guess which clock they're reading. */
export const BUSINESS_TZ_LABEL = "CT";

type DateLike = Date | string | number | null | undefined;

function toDate(v: DateLike): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// 1. CALENDAR DATES — read in UTC
// ---------------------------------------------------------------------------

/**
 * "Sep 1, 2026". For anything that came out of a date picker.
 *
 * en-US to match the rest of the app and the people using it. Note that en-GB
 * renders September as "Sept" in some ICU builds, which is a good reason to pin
 * the locale here rather than let each call site pick one.
 */
export function formatDate(v: DateLike, opts?: Intl.DateTimeFormatOptions): string {
  const d = toDate(v);
  if (!d) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...opts,
    // Not overridable: a calendar date is UTC by construction.
    timeZone: "UTC",
  });
}

/** "Tue, Sep 1, 2026" — when the weekday is what people are actually checking. */
export function formatDateLong(v: DateLike): string {
  return formatDate(v, { weekday: "short" });
}

/**
 * A date range, collapsing what it can:
 *   same month  "Sep 1–3, 2026"
 *   same year   "Aug 28 – Sep 3, 2026"
 *   otherwise   "Dec 30, 2026 – Jan 2, 2027"
 * Both ends are calendar dates.
 */
export function formatDateRange(start: DateLike, end: DateLike): string {
  const s = toDate(start);
  if (!s) return "";
  const e = toDate(end);
  if (!e || e.getTime() === s.getTime()) return formatDate(s);

  const sameMonth =
    s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth();
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();

  if (sameMonth) {
    // "Sep 1–3, 2026"
    const monthDay = s.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return `${monthDay}–${e.getUTCDate()}, ${e.getUTCFullYear()}`;
  }
  if (sameYear) {
    // "Aug 28 – Sep 3, 2026"
    const from = s.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return `${from} – ${formatDate(e)}`;
  }
  return `${formatDate(s)} – ${formatDate(e)}`;
}

/** The value an <input type="date"> expects, without a timezone round-trip. */
export function toDateInput(v: DateLike): string {
  const d = toDate(v);
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Turns "2026-09-01" from a date picker into the instant we store.
 *
 * Explicitly UTC midnight. `new Date("2026-09-01")` already does this, but
 * `new Date(2026, 8, 1)` does NOT — it uses the server's local timezone — and
 * the two are trivially confused. Always go through here.
 */
export function fromDateInput(value: string | null | undefined): Date | null {
  const v = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// 2. INSTANTS — read in Central
// ---------------------------------------------------------------------------

/** "1 Sep 2026, 14:32 CT". */
export function formatDateTime(v: DateLike, opts?: Intl.DateTimeFormatOptions): string {
  const d = toDate(v);
  if (!d) return "";
  const out = d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...opts,
    timeZone: BUSINESS_TZ,
  });
  return `${out} ${BUSINESS_TZ_LABEL}`;
}

/** "14:32 CT" — when the date is already obvious from context. */
export function formatTime(v: DateLike): string {
  const d = toDate(v);
  if (!d) return "";
  const out = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BUSINESS_TZ,
  });
  return `${out} ${BUSINESS_TZ_LABEL}`;
}

/** The calendar day an instant fell on, in Central. "1 Sep 2026". */
export function formatInstantDate(v: DateLike): string {
  const d = toDate(v);
  if (!d) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: BUSINESS_TZ,
  });
}

// ---------------------------------------------------------------------------
// 3. "How long until…" — anchored to Central, not to the viewer
// ---------------------------------------------------------------------------

/** Today's date in Central, as "YYYY-MM-DD". */
export function todayInBusinessTz(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which avoids parsing a localised string back.
  return now.toLocaleDateString("en-CA", { timeZone: BUSINESS_TZ });
}

/**
 * Whole days from today (in Central) until a calendar date.
 * Negative for the past, 0 for today.
 *
 * Compared as calendar days rather than by subtracting milliseconds: a show
 * starting tomorrow morning is "1 day away" regardless of whether it is
 * currently 9am or 11pm, and a millisecond subtraction gets that wrong half the
 * time.
 */
export function daysUntil(target: DateLike, now: Date = new Date()): number | null {
  const d = toDate(target);
  if (!d) return null;
  const todayUtc = new Date(`${todayInBusinessTz(now)}T00:00:00.000Z`);
  const targetUtc = new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
  return Math.round((targetUtc.getTime() - todayUtc.getTime()) / 86_400_000);
}

/** "in 17 days", "today", "3 days ago". */
export function relativeDays(target: DateLike, now: Date = new Date()): string {
  const n = daysUntil(target, now);
  if (n === null) return "";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${Math.abs(n)} days ago`;
}

/** True when a calendar date is strictly before today in Central. */
export function isPastDate(v: DateLike, now: Date = new Date()): boolean {
  const n = daysUntil(v, now);
  return n !== null && n < 0;
}
