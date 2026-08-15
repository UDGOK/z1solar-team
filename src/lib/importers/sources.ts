/**
 * Server-only readers that turn an uploaded file into a grid of cells or a
 * block of text. Kept apart from the parsing rules so the rules stay pure and
 * testable without touching the filesystem or a PDF engine.
 *
 * Both libraries here are pure JS and run in Vercel's Node runtime. Neither is
 * added to `serverExternalPackages` — that list exists specifically to keep
 * @react-pdf out of the webpack bundle so it resolves a single React instance,
 * and adding unrelated packages to it would muddy a fix that took four rounds
 * to land. These bundle fine.
 */

// Server-side only: called from server actions and route handlers. Deliberately
// NOT guarded with the `server-only` package — it isn't a dependency of this
// project and nothing else here uses it, so adding it would mean a new install
// for a compile-time assertion we get from code review anyway.
//
// exceljs and unpdf are imported dynamically inside the functions below so that
// merely importing this module doesn't pull either into a bundle.
import { parseDelimited } from "./csv";

/** Hard ceiling on an uploaded file. Big enough for any real exhibitor list. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
/** Rows beyond this are ignored — a guard against a pathological file. */
export const MAX_ROWS = 6000;

export type SheetGrid = {
  rows: string[][];
  /** Present for workbooks so the UI can say which sheet was read. */
  sheetName?: string;
  /** Other sheets available, so a wrong pick is recoverable without re-upload. */
  otherSheets?: string[];
};

/** Reads a .csv / .tsv / .txt buffer into a grid. */
export function readDelimitedBuffer(buf: Buffer): SheetGrid {
  const text = buf.toString("utf8");
  return { rows: parseDelimited(text).slice(0, MAX_ROWS) };
}

/**
 * Reads the first meaningful worksheet of an .xlsx workbook.
 *
 * Cells are coerced to strings here rather than at the point of use: exceljs
 * hands back numbers, dates, formula objects and rich text, and a booth number
 * like "01220" arrives as the number 1220 unless it is handled deliberately.
 */
export async function readWorkbookBuffer(buf: Buffer): Promise<SheetGrid> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);

  const sheets = wb.worksheets.filter((ws) => ws.rowCount > 0);
  if (sheets.length === 0) return { rows: [] };

  // Prefer a sheet that looks like the exhibitor list rather than blindly
  // taking the first, which is often a cover or instructions tab.
  const preferred =
    sheets.find((ws) => /exhibit|vendor|compan|sponsor|attend|list/i.test(ws.name)) ??
    sheets.reduce((a, b) => (b.rowCount > a.rowCount ? b : a));

  const rows: string[][] = [];
  preferred.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length >= MAX_ROWS) return;
    const values = row.values as any[];
    // exceljs uses a 1-based array with a hole at index 0.
    const cells: string[] = [];
    for (let i = 1; i < values.length; i++) {
      cells.push(cellToString(values[i]));
    }
    if (cells.some((c) => c.trim() !== "")) rows.push(cells);
  });

  return {
    rows,
    sheetName: preferred.name,
    otherSheets: sheets.map((s) => s.name).filter((n) => n !== preferred.name),
  };
}

function cellToString(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    // Hyperlink cell — the text is what a human sees, the target is the URL.
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("hyperlink" in v && typeof v.hyperlink === "string") return String(v.hyperlink).trim();
    // Formula cell — the computed result, not the formula.
    if ("result" in v) return cellToString((v as any).result);
    // Rich text — concatenate the runs.
    if ("richText" in v && Array.isArray((v as any).richText)) {
      return (v as any).richText.map((r: any) => r.text ?? "").join("").trim();
    }
    if ("error" in v) return "";
  }
  return String(v).trim();
}

/**
 * Extracts the text layer of a PDF.
 *
 * Returns an empty string for a scanned/image-only guide rather than throwing —
 * the caller reports "no text found, this looks like a scan" which is a far
 * more useful message than a stack trace.
 */
export async function readPdfBuffer(buf: Buffer): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { totalPages, text } = await extractText(doc, { mergePages: true });
  return { text: typeof text === "string" ? text : String(text ?? ""), pages: totalPages };
}

export type UploadKind = "csv" | "xlsx" | "pdf" | "unknown";

export function detectKind(fileName: string, mime?: string): UploadKind {
  const n = (fileName || "").toLowerCase();
  if (n.endsWith(".csv") || n.endsWith(".tsv") || n.endsWith(".txt")) return "csv";
  if (n.endsWith(".xlsx") || n.endsWith(".xlsm")) return "xlsx";
  if (n.endsWith(".pdf")) return "pdf";
  // .xls (the old binary format) is deliberately NOT claimed — exceljs cannot
  // read it, and failing here with a clear message beats failing deep inside
  // the parser with something unreadable.
  if (mime?.includes("spreadsheetml")) return "xlsx";
  if (mime?.includes("pdf")) return "pdf";
  if (mime?.includes("csv") || mime?.includes("text/plain")) return "csv";
  return "unknown";
}
