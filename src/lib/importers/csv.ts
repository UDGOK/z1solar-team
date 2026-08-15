/**
 * A small RFC 4180 CSV/TSV parser.
 *
 * Written rather than pulled from npm because the requirements are narrow and
 * the failure modes of a naive `split(",")` are exactly the ones real exhibitor
 * exports trigger: quoted commas inside company names
 * ("Hyspan Precision Products, Inc. / Universal Hose and Braid"), embedded
 * newlines inside profile text, and doubled quotes.
 */

export type Delimiter = "," | "\t" | ";" | "|";

/** Picks the delimiter by counting candidates outside quoted regions. */
export function sniffDelimiter(text: string): Delimiter {
  const sample = text.slice(0, 64_000);
  const candidates: Delimiter[] = [",", "\t", ";", "|"];
  let best: Delimiter = ",";
  let bestScore = -1;

  for (const d of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i];
      if (ch === '"') {
        if (inQuotes && sample[i + 1] === '"') i++;
        else inQuotes = !inQuotes;
      } else if (!inQuotes && ch === d) count++;
    }
    if (count > bestScore) {
      bestScore = count;
      best = d;
    }
  }
  return best;
}

/**
 * Parses delimited text into a grid of rows.
 * Never throws on malformed input — an unterminated quote just runs to the end
 * of the file, which produces one odd row rather than losing the whole import.
 */
export function parseDelimited(text: string, delimiter?: Delimiter): string[][] {
  // Strip a UTF-8 BOM; Excel writes one and it otherwise becomes part of the
  // first header name, which silently breaks column auto-mapping.
  let src = text.replace(/^﻿/, "");
  // Normalise line endings so a Windows-authored file behaves identically.
  src = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const d = delimiter ?? sniffDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  // Flush whatever is left; a file with no trailing newline is normal.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop rows that are entirely blank — trailing newlines are extremely common
  // and would otherwise show up as empty exhibitors in the review table.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
