export function fmtMoney(n: number): string {
  if (!n) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function fmtDate(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(date);
}

/** Formats a Date for an <input type="date"> value (YYYY-MM-DD). */
export function toDateInputValue(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}
