/**
 * Timezone handling.
 *
 * The bug these exist to prevent: a trade show entered as 1–3 September
 * displayed as "Aug 31 – Sep 2" to anyone west of UTC, because a calendar date
 * stored as UTC midnight was being formatted in the viewer's local timezone.
 *
 * Each case below runs under a DIFFERENT process timezone. Output must be
 * identical in all of them — that is the whole point. If a change makes these
 * pass in UTC but not in Tokyo, it has reintroduced the bug for anyone
 * travelling.
 */
import { ok, suite } from "./_harness";

/** Reloads the module under a given process timezone. */
function withTz<T>(tz: string, fn: (t: typeof import("../src/lib/time")) => T): T {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  // Node caches timezone data per-process; clearing the module registry is not
  // enough on its own, but Intl reads process.env.TZ on each call, which is
  // what these helpers use.
  const mod = require("../src/lib/time") as typeof import("../src/lib/time");
  try {
    return fn(mod);
  } finally {
    process.env.TZ = prev;
  }
}

const ZONES = ["UTC", "America/Chicago", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney"];

export default async function run() {
  return suite("timezone handling", () => {
    // ---- 1. THE BUG. A calendar date must read the same everywhere. ----
    for (const tz of ZONES) {
      withTz(tz, (t) => {
        const stored = t.fromDateInput("2026-09-01")!;
        ok(
          stored.toISOString() === "2026-09-01T00:00:00.000Z",
          `[${tz}] a date picker value stores as UTC midnight`,
          stored.toISOString()
        );
        ok(
          t.formatDate(stored) === "Sep 1, 2026",
          `[${tz}] …and displays as Sep 1, 2026, never Aug 31`,
          t.formatDate(stored)
        );
      });
    }

    // ---- 2. The Datacloud range, in every zone ----
    for (const tz of ZONES) {
      withTz(tz, (t) => {
        const start = t.fromDateInput("2026-09-01")!;
        const end = t.fromDateInput("2026-09-03")!;
        ok(
          t.formatDateRange(start, end) === "Sep 1–3, 2026",
          `[${tz}] Datacloud reads Sep 1–3, 2026`,
          t.formatDateRange(start, end)
        );
      });
    }

    // ---- 3. Ranges that cross a month and a year ----
    withTz("America/Chicago", (t) => {
      const a = t.fromDateInput("2026-08-28")!;
      const b = t.fromDateInput("2026-09-03")!;
      ok(t.formatDateRange(a, b) === "Aug 28 – Sep 3, 2026", "cross-month range", t.formatDateRange(a, b));

      const c = t.fromDateInput("2026-12-30")!;
      const d = t.fromDateInput("2027-01-02")!;
      ok(
        t.formatDateRange(c, d) === "Dec 30, 2026 – Jan 2, 2027",
        "cross-year range keeps both years",
        t.formatDateRange(c, d)
      );

      const one = t.fromDateInput("2026-09-01")!;
      ok(t.formatDateRange(one, one) === "Sep 1, 2026", "single-day range collapses");
      ok(t.formatDateRange(one, null) === "Sep 1, 2026", "missing end date is fine");
    });

    // ---- 4. INSTANTS render in Central, not in the viewer's zone ----
    // 2026-09-01T18:30:00Z is 13:30 in Chicago (CDT, UTC-5).
    for (const tz of ZONES) {
      withTz(tz, (t) => {
        const instant = new Date("2026-09-01T18:30:00.000Z");
        ok(
          t.formatTime(instant) === "13:30 CT",
          `[${tz}] an instant reads 13:30 CT everywhere`,
          t.formatTime(instant)
        );
        ok(
          t.formatDateTime(instant).endsWith("13:30 CT"),
          `[${tz}] full timestamp is Central`,
          t.formatDateTime(instant)
        );
      });
    }

    // ---- 5. An instant near midnight lands on the right Central day ----
    withTz("Asia/Tokyo", (t) => {
      // 03:00Z on 2 Sep is still 22:00 on 1 Sep in Chicago.
      const late = new Date("2026-09-02T03:00:00.000Z");
      ok(t.formatInstantDate(late) === "Sep 1, 2026", "late-night instant is the Central day", t.formatInstantDate(late));
      ok(t.formatTime(late) === "22:00 CT", "…at 22:00", t.formatTime(late));
    });

    // ---- 6. Standard time vs daylight time ----
    withTz("UTC", (t) => {
      // January: Chicago is CST (UTC-6).
      const winter = new Date("2026-01-15T18:30:00.000Z");
      ok(t.formatTime(winter) === "12:30 CT", "CST is UTC-6 in January", t.formatTime(winter));
      // July: CDT (UTC-5).
      const summer = new Date("2026-07-15T18:30:00.000Z");
      ok(t.formatTime(summer) === "13:30 CT", "CDT is UTC-5 in July", t.formatTime(summer));
    });

    // ---- 7. Countdowns anchored to Central, not the viewer ----
    for (const tz of ZONES) {
      withTz(tz, (t) => {
        // 15 Aug 2026 06:00Z = 01:00 on the 15th in Chicago.
        const now = new Date("2026-08-15T06:00:00.000Z");
        const show = t.fromDateInput("2026-09-01")!;
        ok(t.daysUntil(show, now) === 17, `[${tz}] 17 days to the show`, String(t.daysUntil(show, now)));
        ok(t.relativeDays(show, now) === "in 17 days", `[${tz}] reads "in 17 days"`);
      });
    }

    // ---- 8. The edge that breaks millisecond arithmetic ----
    withTz("Australia/Sydney", (t) => {
      // 23:30 on 15 Aug in Sydney is still 08:30 on the 15th in Chicago.
      const now = new Date("2026-08-15T13:30:00.000Z");
      const tomorrow = t.fromDateInput("2026-08-16")!;
      ok(t.daysUntil(tomorrow, now) === 1, "tomorrow is 1 day away, not 0 or 2", String(t.daysUntil(tomorrow, now)));
      ok(t.relativeDays(tomorrow, now) === "tomorrow", "…and reads 'tomorrow'");

      const today = t.fromDateInput("2026-08-15")!;
      ok(t.daysUntil(today, now) === 0, "today is 0 days away", String(t.daysUntil(today, now)));
      ok(t.relativeDays(today, now) === "today", "…and reads 'today'");
      ok(!t.isPastDate(today, now), "today is not past");

      const yesterday = t.fromDateInput("2026-08-14")!;
      ok(t.isPastDate(yesterday, now), "yesterday is past");
      ok(t.relativeDays(yesterday, now) === "yesterday", "…and reads 'yesterday'");
    });

    // ---- 9. Round-tripping a date picker value must not drift ----
    for (const tz of ZONES) {
      withTz(tz, (t) => {
        for (const v of ["2026-01-01", "2026-03-08", "2026-09-01", "2026-11-01", "2026-12-31"]) {
          const back = t.toDateInput(t.fromDateInput(v));
          ok(back === v, `[${tz}] ${v} survives a round trip`, back);
        }
      });
    }

    // ---- 10. Junk in, empty string out — never "Invalid Date" on screen ----
    withTz("UTC", (t) => {
      for (const bad of [null, undefined, "", "not a date"]) {
        ok(t.formatDate(bad as any) === "", `formatDate(${JSON.stringify(bad)}) is empty`);
        ok(t.formatDateTime(bad as any) === "", `formatDateTime(${JSON.stringify(bad)}) is empty`);
      }
      ok(t.fromDateInput("01/09/2026") === null, "a non-ISO date input is rejected, not guessed");
      ok(t.daysUntil(null) === null, "daysUntil(null) is null");
    });
  });
}
