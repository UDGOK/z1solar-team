"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FIELD_LABELS, type FieldKey } from "@/lib/importers/columnMap";
import {
  prepareUpload,
  stagePreparedUpload,
  stageImportFromUpload,
  stageImportFromText,
  getImportForReview,
  setImportItemAccepted,
  setAllImportItemsAccepted,
  clearImportItemMatch,
  applyImport,
  discardImport,
} from "@/lib/exhibitors/actions";

type ReviewItem = {
  id: string;
  companyName: string;
  booth: string | null;
  description: string | null;
  websiteUrl: string | null;
  listing: string;
  sponsorTier: string | null;
  confidence: string;
  origin: string;
  reason: string | null;
  matchKind: string;
  matchReason: string | null;
  matchedVendorName: string | null;
  accepted: boolean;
  sourceLine: number;
};

type Prepared = {
  headers: string[];
  map: FieldKey[];
  hasHeader: boolean;
  samples: string[][];
  rowCount: number;
  fileName: string;
  source: string;
  sheetName?: string;
  otherSheets?: string[];
  grid: string[][];
};

type Review = {
  id: string;
  status: string;
  fileName: string | null;
  source: string;
  showId: string;
  showName: string;
  items: ReviewItem[];
};

export default function ExhibitorImportWizard({
  showId,
  showName,
}: {
  showId: string;
  showName: string;
}) {
  const router = useRouter();
  const [source, setSource] = useState<"file" | "paste">("file");
  const [pasted, setPasted] = useState("");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"attention" | "all" | "new" | "dupes">("all");
  const [busy, startTransition] = useTransition();

  function fail(e: any) {
    setError(e?.message ?? "Something went wrong.");
  }

  async function loadReview(importId: string, note: string) {
    const r = (await getImportForReview(importId)) as Review;
    setReview(r);
    setSummary(note);
  }

  /**
   * Spreadsheets go through a mapping step; PDFs go straight to review because
   * they have no columns to map.
   */
  function onFile(file: File) {
    setError(null);
    const isPdf = /\.pdf$/i.test(file.name);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        if (isPdf) {
          const r = await stageImportFromUpload(showId, fd);
          await loadReview(
            r.importId,
            `${r.found} rows found in ${file.name}${r.skipped > 0 ? ` · ${r.skipped} lines skipped` : ""}`
          );
          return;
        }
        setPrepared(await prepareUpload(showId, fd));
      } catch (e) {
        fail(e);
      }
    });
  }

  function confirmMapping() {
    if (!prepared) return;
    setError(null);
    startTransition(async () => {
      try {
        const r = await stagePreparedUpload(showId, {
          grid: prepared.grid,
          map: prepared.map,
          hasHeader: prepared.hasHeader,
          source: prepared.source,
          fileName: prepared.fileName,
        });
        setPrepared(null);
        await loadReview(
          r.importId,
          `${r.found} rows found in ${prepared.fileName}${r.skipped > 0 ? ` · ${r.skipped} skipped` : ""}${
            prepared.sheetName ? ` · sheet "${prepared.sheetName}"` : ""
          }`
        );
      } catch (e) {
        fail(e);
      }
    });
  }

  function setField(col: number, field: FieldKey) {
    if (!prepared) return;
    const map = [...prepared.map];
    // Each field can only be claimed once. Assigning it elsewhere releases the
    // previous column rather than silently mapping two columns onto one field,
    // where one would overwrite the other with no indication.
    if (field !== "ignore") {
      for (let i = 0; i < map.length; i++) if (i !== col && map[i] === field) map[i] = "ignore";
    }
    map[col] = field;
    setPrepared({ ...prepared, map });
  }

  function onPaste() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await stageImportFromText(showId, pasted, "PASTE");
        await loadReview(
          r.importId,
          `${r.found} rows found${r.skipped > 0 ? ` · ${r.skipped} lines skipped as headings or page furniture` : ""}`
        );
      } catch (e) {
        fail(e);
      }
    });
  }

  const visible = review
    ? review.items.filter((i) => {
        if (filter === "all") return true;
        if (filter === "attention") return i.confidence !== "high" || i.matchKind !== "none";
        if (filter === "new") return i.matchKind === "none";
        return i.matchKind !== "none";
      })
    : [];

  const accepted = review?.items.filter((i) => i.accepted).length ?? 0;
  const willUpdate = review?.items.filter((i) => i.accepted && i.matchKind !== "none").length ?? 0;

  return (
    <div>
      <div className="mb-1 text-xs text-brand-inkFaint">
        <Link href="/trade-shows" className="hover:text-brand-greenDark">
          Trade shows
        </Link>{" "}
        &rarr;{" "}
        <Link href={`/trade-shows/${showId}/exhibitors`} className="hover:text-brand-greenDark">
          {showName}
        </Link>{" "}
        &rarr; Import
      </div>
      <h1 className="font-heading text-2xl font-extrabold text-brand-ink">Import exhibitors</h1>
      <p className="mb-5 mt-1 text-sm text-brand-inkSoft">
        Nothing is saved until you review it and press commit.
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-brand-inkFaint">
        <span className={!review && !prepared ? "font-bold text-brand-greenDark" : ""}>1 · Source</span>
        <span>&rarr;</span>
        <span className={prepared ? "font-bold text-brand-greenDark" : ""}>2 · Map columns</span>
        <span>&rarr;</span>
        <span className={review ? "font-bold text-brand-greenDark" : ""}>3 · Review</span>
        <span>&rarr;</span>
        <span>4 · Commit</span>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ---------- step 1 ---------- */}
      {!review && !prepared && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            {[
              {
                k: "file" as const,
                t: "Spreadsheet or PDF",
                d: ".csv, .xlsx, or the show's PDF exhibitor guide",
              },
              {
                k: "paste" as const,
                t: "Paste text",
                d: "Copied straight off the exhibitor directory page",
              },
            ].map((s) => (
              <button
                key={s.k}
                onClick={() => setSource(s.k)}
                className={`rounded-md border-2 border-dashed p-4 text-left transition-colors ${
                  source === s.k
                    ? "border-brand-greenDark bg-brand-greenTint"
                    : "border-brand-line bg-white hover:border-brand-green"
                }`}
              >
                <div className="font-heading text-sm font-bold text-brand-ink">{s.t}</div>
                <div className="mt-1 text-xs text-brand-inkFaint">{s.d}</div>
              </button>
            ))}
          </div>

          <div className="card p-4">
            {source === "file" ? (
              <>
                <label className="label">Choose a file</label>
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xlsm,.pdf"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                  }}
                  className="block w-full text-sm text-brand-inkSoft file:mr-3 file:rounded-md file:border-0 file:bg-brand-green file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-greenDark"
                />
                <div className="mt-3 rounded-md border border-[#F0DCB0] bg-[#FFF8E7] px-3 py-2.5 text-xs text-[#7c5c11]">
                  <b>How columns are handled.</b> We read your header row and suggest which of our
                  fields each column belongs to &mdash; then show you every guess next to real values
                  from your file so you can correct any of it before anything is imported. Only the
                  company name is required; everything else can be left as &ldquo;ignore&rdquo;.
                  <div className="mt-1.5">
                    A PDF skips this step and is read for its text layer &mdash; a scanned guide has
                    no text to extract, and will say so rather than importing nothing silently.
                  </div>
                </div>
              </>
            ) : (
              <>
                <label className="label">Paste the exhibitor list</label>
                <textarea
                  className="input font-mono text-xs"
                  rows={12}
                  value={pasted}
                  disabled={busy}
                  placeholder={"Sungrow Power Supply Co., Ltd.  Booth B1420\nNextracker | A-0912 | nextracker.com\n…"}
                  onChange={(e) => setPasted(e.target.value)}
                />
                <button
                  className="btn-primary mt-3"
                  disabled={busy || !pasted.trim()}
                  onClick={onPaste}
                >
                  {busy ? "Reading…" : "Read this list"}
                </button>
              </>
            )}
            {busy && <p className="mt-3 text-sm text-brand-inkSoft">Reading&hellip;</p>}
          </div>
        </>
      )}

      {/* ---------- step 2: column mapping ---------- */}
      {prepared && !review && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="kicker">[ Check the columns ]</p>
              <div className="mt-1 font-heading text-sm font-bold text-brand-ink">
                {prepared.fileName}
              </div>
              <p className="text-xs text-brand-inkFaint">
                {prepared.rowCount} rows · {prepared.headers.length} columns
                {prepared.sheetName ? ` · sheet "${prepared.sheetName}"` : ""}
                {prepared.hasHeader ? "" : " · no header row detected"}
              </p>
            </div>
            <button className="btn-secondary" disabled={busy} onClick={() => setPrepared(null)}>
              Choose a different file
            </button>
          </div>

          {prepared.otherSheets && prepared.otherSheets.length > 0 && (
            <div className="mb-4 rounded-md border border-[#F0DCB0] bg-[#FFF8E7] px-4 py-3 text-sm text-[#7c5c11]">
              This workbook also contains{" "}
              <b>{prepared.otherSheets.join(", ")}</b>. We read{" "}
              <b>{prepared.sheetName}</b> because it looked most like the exhibitor list. If that&rsquo;s
              wrong, delete the other sheets and upload again.
            </div>
          )}

          <div className="card overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="tag w-[26%] border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint">
                    Column in your file
                  </th>
                  <th className="tag w-[26%] border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint">
                    Maps to
                  </th>
                  <th className="tag border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint">
                    What&rsquo;s actually in it
                  </th>
                </tr>
              </thead>
              <tbody>
                {prepared.headers.map((h, col) => {
                  const field = prepared.map[col] ?? "ignore";
                  const empty = (prepared.samples[col] ?? []).length === 0;
                  return (
                    <tr key={col} className="border-b border-[#EEEEEA]">
                      <td className="px-3 py-2.5 align-top">
                        <span className="font-heading text-sm font-bold text-brand-ink">{h}</span>
                        {empty && (
                          <div className="text-[11px] text-brand-inkFaint">always empty</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <select
                          className="input"
                          value={field}
                          disabled={busy}
                          onChange={(e) => setField(col, e.target.value as FieldKey)}
                        >
                          {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
                            <option key={k} value={k}>
                              {FIELD_LABELS[k]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5 align-top font-mono text-[11.5px] text-brand-inkFaint">
                        {(prepared.samples[col] ?? []).map((v, i) => (
                          <div key={i}>{v}</div>
                        ))}
                        {empty && <span>&mdash;</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3.5">
              <span className="text-[12.5px] text-brand-inkFaint">
                {prepared.map.includes("companyName") ? (
                  <>Still nothing written to the database.</>
                ) : (
                  <span className="font-semibold text-red-600">
                    Pick which column holds the company name.
                  </span>
                )}
              </span>
              <button
                className="btn-primary"
                disabled={busy || !prepared.map.includes("companyName")}
                onClick={confirmMapping}
              >
                {busy ? "Reading…" : `Read ${prepared.rowCount} rows →`}
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-brand-inkFaint">
            We guess the mapping from your header names. Anything we couldn&rsquo;t place is set to
            &ldquo;ignore&rdquo; rather than guessed at. A field can only be used once &mdash;
            assigning it to a new column releases the old one.
          </p>
        </>
      )}

      {/* ---------- step 2 ---------- */}
      {review && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="kicker">[ Review before committing ]</p>
              <p className="mt-1 text-sm text-brand-inkSoft">{summary}</p>
            </div>
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await discardImport(review.id);
                    setReview(null);
                    setSummary(null);
                  } catch (e) {
                    fail(e);
                  }
                })
              }
            >
              Start over
            </button>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {[
              { k: "all" as const, l: `All ${review.items.length}` },
              {
                k: "attention" as const,
                l: `Needs a look (${review.items.filter((i) => i.confidence !== "high" || i.matchKind !== "none").length})`,
              },
              { k: "new" as const, l: `New (${review.items.filter((i) => i.matchKind === "none").length})` },
              {
                k: "dupes" as const,
                l: `Already known (${review.items.filter((i) => i.matchKind !== "none").length})`,
              },
            ].map((f) => (
              <button
                key={f.k}
                onClick={() => setFilter(f.k)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  filter === f.k
                    ? "border-brand-green bg-brand-green font-semibold text-white"
                    : "border-brand-line bg-white text-brand-inkSoft hover:bg-brand-greenTint"
                }`}
              >
                {f.l}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button
                className="btn-secondary text-xs"
                disabled={busy}
                onClick={() =>
                  startTransition(async () => {
                    await setAllImportItemsAccepted(review.id, false);
                    await loadReview(review.id, summary ?? "");
                  })
                }
              >
                Deselect all
              </button>
              <button
                className="btn-secondary text-xs"
                disabled={busy}
                onClick={() =>
                  startTransition(async () => {
                    await setAllImportItemsAccepted(review.id, true);
                    await loadReview(review.id, summary ?? "");
                  })
                }
              >
                Select all
              </button>
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-9 border-b border-brand-line px-3 py-2" />
                  <th className="tag w-[78px] border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint">
                    Booth
                  </th>
                  <th className="tag border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint">
                    Parsed as
                  </th>
                  <th className="tag w-[104px] border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint">
                    Confidence
                  </th>
                  <th className="tag w-[70px] border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint">
                    From
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((i) => (
                  <tr
                    key={i.id}
                    className={`border-b border-[#EEEEEA] ${i.confidence === "low" ? "bg-[#FFF8F8]" : ""}`}
                  >
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-green"
                        checked={i.accepted}
                        disabled={busy}
                        onChange={(e) =>
                          startTransition(async () => {
                            await setImportItemAccepted(i.id, e.target.checked);
                            setReview({
                              ...review,
                              items: review.items.map((x) =>
                                x.id === i.id ? { ...x, accepted: e.target.checked } : x
                              ),
                            });
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-3 align-top font-mono text-[13px] font-bold">
                      {i.booth || <span className="text-brand-inkFaint">&mdash;</span>}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-heading text-sm font-bold text-brand-ink">
                        {i.companyName}
                        {i.listing !== "Exhibitor" && (
                          <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-brand-inkFaint">
                            {i.sponsorTier || i.listing}
                          </span>
                        )}
                      </div>
                      {i.description && (
                        <div className="mt-0.5 max-w-[520px] text-[12.5px] text-brand-inkSoft">
                          {i.description}
                        </div>
                      )}
                      {i.matchReason && (
                        <div className="mt-1.5 rounded border border-[#F0DCB0] bg-[#FFF8E7] px-2 py-1.5 text-xs text-[#7c5c11]">
                          {i.matchReason}
                          {i.matchKind === "fuzzy" && (
                            <button
                              className="ml-2 underline"
                              disabled={busy}
                              onClick={() =>
                                startTransition(async () => {
                                  await clearImportItemMatch(i.id);
                                  await loadReview(review.id, summary ?? "");
                                })
                              }
                            >
                              Keep separate
                            </button>
                          )}
                        </div>
                      )}
                      {i.reason && (
                        <div className="mt-1.5 rounded border border-[#F3C4C4] bg-[#FDE8E8] px-2 py-1.5 text-xs text-[#8a2222]">
                          {i.reason}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                          i.confidence === "high"
                            ? "bg-[#E7F3E4] text-brand-greenDark"
                            : i.confidence === "medium"
                              ? "bg-[#FFF3E0] text-[#B45309]"
                              : "bg-[#FDE8E8] text-[#B91C1C]"
                        }`}
                      >
                        {i.confidence}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top font-mono text-[10px] uppercase tracking-wider text-brand-inkFaint">
                      {i.origin}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3.5">
              <span className="text-[12.5px] text-brand-inkFaint">
                {accepted} of {review.items.length} selected &middot; {willUpdate} will update an
                existing company, {accepted - willUpdate} will be created
              </span>
              <button
                className="btn-primary"
                disabled={busy || accepted === 0}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const r = await applyImport(review.id);
                      router.push(`/trade-shows/${showId}/exhibitors`);
                      router.refresh();
                      void r;
                    } catch (e) {
                      fail(e);
                    }
                  })
                }
              >
                {busy ? "Committing…" : `Commit ${accepted} exhibitors`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
