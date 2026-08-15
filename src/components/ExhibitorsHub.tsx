"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateExhibitor,
  addExhibitorNote,
  addExhibitorManually,
  updateVendor,
  scoreNextVendorBatch,
  countUnscoredVendors,
  setVendorScore,
} from "@/lib/exhibitors/actions";
import { MEETING_STATUSES } from "@/lib/exhibitors/constants";

export type ExhibitorItem = {
  id: string;
  booth: string | null;
  hall: string | null;
  listing: string;
  sponsorTier: string | null;
  meetingWanted: boolean;
  meetingStatus: string;
  priority: string;
  notes: string | null;
  outcome: string | null;
  ownerIds: string[];
  ownerNames: string[];
  vendor: {
    id: string;
    name: string;
    description: string | null;
    websiteUrl: string | null;
    hqCountry: string | null;
    notes: string | null;
    sector: string | null;
    reputationScore: number | null;
    riskNotes: string | null;
    riskSource: string | null;
    riskAssessedAt: string | null;
    riskAssessedByName: string | null;
    tagIds: string[];
    tagNames: string[];
    contacts: { id: string; name: string; title: string | null; email: string | null; phone: string | null }[];
    history: { showName: string; year: number; booth: string | null; notes: string | null; meetingStatus: string }[];
  };
  projectIds: string[];
  projectNames: string[];
  noteEntries: { id: string; authorName: string; body: string; createdAt: string }[];
};

type Props = {
  showId: string;
  showName: string;
  showWhen: string;
  showWhere: string;
  ourBooth: string | null;
  items: ExhibitorItem[];
  tags: { id: string; name: string }[];
  projects: { id: string; title: string }[];
  team: { id: string; name: string }[];
  canManage: boolean;
  canAnnotate: boolean;
};

/**
 * Sorts booth codes the way a floor is actually walked: "A9" before "A10",
 * which a plain string sort gets wrong. Splits into letter and number parts and
 * compares the numbers numerically.
 */
function boothCompare(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const pa = a.match(/^([A-Za-z]*)[-\s]?(\d*)(.*)$/) ?? [];
  const pb = b.match(/^([A-Za-z]*)[-\s]?(\d*)(.*)$/) ?? [];
  const alpha = (pa[1] ?? "").localeCompare(pb[1] ?? "");
  if (alpha !== 0) return alpha;
  const na = pa[2] ? parseInt(pa[2], 10) : Number.MAX_SAFE_INTEGER;
  const nb = pb[2] ? parseInt(pb[2], 10) : Number.MAX_SAFE_INTEGER;
  if (na !== nb) return na - nb;
  return (pa[3] ?? "").localeCompare(pb[3] ?? "");
}

export default function ExhibitorsHub({
  showId,
  showName,
  showWhen,
  showWhere,
  ourBooth,
  items,
  tags,
  projects,
  team,
  canManage,
  canAnnotate,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"booth" | "name" | "flagged">("flagged");
  const [openId, setOpenId] = useState<string | null>(null);
  const [scoreOpen, setScoreOpen] = useState<ExhibitorItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [scoring, setScoring] = useState<null | { done: number; total: number; unknown: number; note: string }>(null);

  /**
   * Runs the AI assessment in batches from the browser.
   *
   * Deliberately a client-side loop over a small server action rather than one
   * long server call: 800 companies will not finish inside a serverless
   * function's execution limit, and each batch is written before the next
   * starts, so closing the tab loses at most one batch rather than everything.
   */
  async function runScoring() {
    setError(null);
    try {
      const start = await countUnscoredVendors(showId);
      if (!start.configured) {
        setError("DEEPSEEK_API_KEY isn't set in Vercel, so there's nothing to score with.");
        return;
      }
      if (start.unscored === 0) {
        setScoring({ done: 0, total: 0, unknown: 0, note: "Every company has already been assessed." });
        return;
      }
      let done = 0, unknown = 0;
      const total = start.unscored;
      setScoring({ done, total, unknown, note: "Starting…" });
      // Bounded: if the server ever stopped making progress this would
      // otherwise spin forever.
      for (let guard = 0; guard < 400; guard++) {
        const r = await scoreNextVendorBatch(showId);
        if (r.error) { setError(r.error); break; }
        done += r.scored + r.unknown + r.failed;
        unknown += r.unknown;
        setScoring({ done, total, unknown, note: `${done} of ${total} assessed` });
        if (r.remaining === 0) break;
        if (r.scored + r.unknown + r.failed === 0) break;
      }
      setScoring({ done, total, unknown, note: `Finished — ${done} assessed, ${unknown} not recognised.` });
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Scoring failed.");
    }
  }

  const stats = useMemo(() => {
    const flagged = items.filter((i) => i.meetingWanted);
    return {
      total: items.length,
      flagged: flagged.length,
      met: flagged.filter((i) => i.meetingStatus === "Met").length,
      unassigned: flagged.filter((i) => i.ownerIds.length === 0).length,
    };
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = items.filter((i) => {
      if (flaggedOnly && !i.meetingWanted) return false;
      if (activeTags.length > 0 && !activeTags.every((t) => i.vendor.tagIds.includes(t))) return false;
      if (!q) return true;
      return (
        i.vendor.name.toLowerCase().includes(q) ||
        (i.booth ?? "").toLowerCase().includes(q) ||
        (i.vendor.description ?? "").toLowerCase().includes(q) ||
        i.vendor.tagNames.some((t) => t.toLowerCase().includes(q)) ||
        i.projectNames.some((p) => p.toLowerCase().includes(q))
      );
    });

    out = [...out];
    if (sortBy === "booth") out.sort((a, b) => boothCompare(a.booth, b.booth));
    else if (sortBy === "name") out.sort((a, b) => a.vendor.name.localeCompare(b.vendor.name));
    else
      out.sort(
        (a, b) =>
          Number(b.meetingWanted) - Number(a.meetingWanted) ||
          boothCompare(a.booth, b.booth) ||
          a.vendor.name.localeCompare(b.vendor.name)
      );
    return out;
  }, [items, query, activeTags, flaggedOnly, sortBy]);

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e: any) {
        setError(e?.message ?? "Something went wrong.");
      }
    });
  }

  const toggleTag = (id: string) =>
    setActiveTags((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <div>
      {/* ---- header ---- */}
      <div className="mb-1 text-xs text-brand-inkFaint">
        <Link href="/trade-shows" className="hover:text-brand-greenDark">
          Trade shows
        </Link>{" "}
        &rarr; {showName}
      </div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker mb-1">[ Exhibitor directory ]</p>
          <h1 className="font-heading text-3xl font-extrabold text-brand-ink">{showName}</h1>
          <p className="mt-1 text-sm text-brand-inkSoft">
            {showWhen}
            {showWhere ? ` · ${showWhere}` : ""}
            {ourBooth ? ` · our booth ${ourBooth}` : ""}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setShowAdd((v) => !v)}>
              Add a company
            </button>
            <button className="btn-secondary" onClick={runScoring} disabled={!!scoring && !scoring.note.startsWith("Finished")}>
              Assess with AI
            </button>
            <a
              href={`/api/trade-shows/${showId}/target-list`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
            >
              Print target list
            </a>
            <Link href={`/trade-shows/${showId}/exhibitors/import`} className="btn-primary">
              Import exhibitors
            </Link>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {scoring && (
        <div className="mb-4 rounded-md border border-[#F0DCB0] bg-[#FFF8E7] px-4 py-3 text-sm text-[#7c5c11]">
          <b>AI assessment</b> — {scoring.note}
          {scoring.total > 0 && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-[#F0DCB0]">
              <div
                className="h-full bg-brand-amber transition-all"
                style={{ width: `${Math.min(100, Math.round((scoring.done / scoring.total) * 100))}%` }}
              />
            </div>
          )}
          <p className="mt-2 text-xs">
            These are a language model&rsquo;s impressions, not research. Anything it doesn&rsquo;t
            recognise is left blank rather than given a polite number. Treat every score as
            unverified until someone checks it.
          </p>
        </div>
      )}

      {/* ---- stats ---- */}
      <div className="mb-5 flex flex-wrap gap-2.5">
        {[
          { n: stats.total, l: "Exhibitors", c: "text-brand-ink" },
          { n: stats.flagged, l: "Meeting wanted", c: "text-brand-amber" },
          { n: stats.met, l: "Met", c: "text-brand-ink" },
          { n: stats.unassigned, l: "Unassigned", c: stats.unassigned > 0 ? "text-brand-amber" : "text-brand-ink" },
        ].map((s) => (
          <div key={s.l} className="card min-w-[118px] px-4 py-2.5">
            <div className={`font-heading text-2xl font-extrabold leading-tight ${s.c}`}>{s.n}</div>
            <div className="tag mt-0.5 text-brand-inkFaint">{s.l}</div>
          </div>
        ))}
      </div>

      {/* ---- add one by hand ---- */}
      {showAdd && canManage && (
        <AddCompany
          showId={showId}
          tags={tags}
          busy={pending}
          onDone={() => setShowAdd(false)}
          onError={setError}
        />
      )}

      {/* ---- toolbar ---- */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <input
          className="input max-w-[300px]"
          placeholder="Search company, booth, or what they do…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          onClick={() => setFlaggedOnly((v) => !v)}
          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
            flaggedOnly
              ? "border-brand-amber bg-brand-amber font-semibold text-white"
              : "border-brand-line bg-white text-brand-inkSoft hover:bg-brand-greenTint"
          }`}
        >
          {"★"} Meeting wanted
        </button>
        {tags.map((t) => (
          <button
            key={t.id}
            onClick={() => toggleTag(t.id)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              activeTags.includes(t.id)
                ? "border-brand-green bg-brand-green font-semibold text-white"
                : "border-brand-line bg-white text-brand-inkSoft hover:bg-brand-greenTint"
            }`}
          >
            {t.name}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-xs text-brand-inkFaint">
          <span>Sort</span>
          <select
            className="rounded-md border border-brand-line px-2 py-1 text-xs"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="flagged">Flagged first</option>
            <option value="booth">Booth</option>
            <option value="name">Company</option>
          </select>
        </div>
      </div>

      {scoreOpen && (
        <ScoreDetail
          item={scoreOpen}
          canAnnotate={canAnnotate}
          busy={pending}
          onClose={() => setScoreOpen(null)}
          onSave={(sc, n) => {
            run(() => setVendorScore(scoreOpen.vendor.id, sc, n, scoreOpen.id));
            setScoreOpen(null);
          }}
        />
      )}

      {/* ---- the list ---- */}
      {items.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-heading text-lg font-bold text-brand-ink">No exhibitors yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-brand-inkSoft">
            Import the show&rsquo;s exhibitor list from a spreadsheet, the directory page, or the
            PDF floor guide. Nothing is saved until you review it.
          </p>
          {canManage && (
            <Link href={`/trade-shows/${showId}/exhibitors/import`} className="btn-primary mt-4">
              Import exhibitors
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="tag w-[86px] border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint">
                  Booth
                </th>
                <th className="tag border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint">
                  Company
                </th>
                <th className="tag hidden w-[180px] border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint md:table-cell">
                  Tags
                </th>
                <th className="tag hidden w-[170px] border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint lg:table-cell">
                  Meeting about
                </th>
                <th className="tag hidden w-[110px] border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint lg:table-cell">
                  Owner
                </th>
                <th className="tag w-[70px] border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint">
                  Score
                </th>
                <th className="tag w-[56px] border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint">
                  Flag
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((it) => (
                <Row
                  key={it.id}
                  item={it}
                  open={openId === it.id}
                  onToggleOpen={() => setOpenId(openId === it.id ? null : it.id)}
                  tags={tags}
                  projects={projects}
                  team={team}
                  canManage={canManage}
                  canAnnotate={canAnnotate}
                  busy={pending}
                  run={run}
                  onOpenScore={setScoreOpen}
                />
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-brand-inkFaint">
                    Nothing matches those filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-3 py-3 text-xs text-brand-inkFaint">
            <span>
              Showing {visible.length} of {items.length}
            </span>
            {pending && <span>Saving…</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Row({
  item,
  open,
  onToggleOpen,
  tags,
  projects,
  team,
  canManage,
  canAnnotate,
  busy,
  run,
  onOpenScore,
}: {
  item: ExhibitorItem;
  open: boolean;
  onToggleOpen: () => void;
  tags: { id: string; name: string }[];
  projects: { id: string; title: string }[];
  team: { id: string; name: string }[];
  canManage: boolean;
  canAnnotate: boolean;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => void;
  onOpenScore: (item: ExhibitorItem) => void;
}) {
  const [note, setNote] = useState("");

  return (
    <>
      <tr className="cursor-pointer border-b border-[#EEEEEA] hover:bg-brand-greenTint" onClick={onToggleOpen}>
        <td className="px-3 py-3 align-top font-mono text-[13px] font-bold text-brand-ink">
          {item.booth || <span className="text-brand-inkFaint">&mdash;</span>}
          {item.hall && <div className="text-[10px] font-normal text-brand-inkFaint">{item.hall}</div>}
        </td>
        <td className="px-3 py-3 align-top">
          <div className="font-heading text-sm font-bold text-brand-ink">
            {item.vendor.name}
            {item.listing !== "Exhibitor" && (
              <span className="ml-2 rounded bg-brand-greenTint px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-brand-greenDark">
                {item.sponsorTier || item.listing}
              </span>
            )}
          </div>
          {item.vendor.description && (
            <div className="mt-0.5 max-w-[440px] text-[12.5px] text-brand-inkSoft line-clamp-2">
              {item.vendor.description}
            </div>
          )}
          {item.vendor.websiteUrl && (
            <a
              href={item.vendor.websiteUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[12.5px] text-brand-greenDark underline decoration-[#cfe3ca]"
            >
              {item.vendor.websiteUrl.replace(/^https?:\/\//, "")}
            </a>
          )}
        </td>
        <td className="hidden px-3 py-3 align-top md:table-cell">
          {item.vendor.tagNames.slice(0, 3).map((t) => (
            <span
              key={t}
              className="mr-1 inline-flex rounded border border-[#cfe3ca] bg-brand-greenTint px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-brand-greenDark"
            >
              {t}
            </span>
          ))}
        </td>
        <td className="hidden px-3 py-3 align-top text-[12.5px] text-brand-inkSoft lg:table-cell">
          {item.projectNames.join(", ") || <span className="text-brand-inkFaint">&mdash;</span>}
        </td>
        <td className="hidden px-3 py-3 align-top text-xs text-brand-inkSoft lg:table-cell">
          {item.ownerNames.length > 0 ? (
            item.ownerNames.join(", ")
          ) : (
            <span className="text-brand-inkFaint">&mdash;</span>
          )}
        </td>
        <td className="px-3 py-3 align-top">
          <ScoreBadge item={item} onOpen={onOpenScore} />
        </td>
        <td className="px-3 py-3 align-top">
          <button
            disabled={!canAnnotate || busy}
            onClick={(e) => {
              e.stopPropagation();
              run(() => updateExhibitor(item.id, { meetingWanted: !item.meetingWanted }));
            }}
            aria-label={item.meetingWanted ? "Remove meeting flag" : "Flag for a meeting"}
            className={`h-8 w-8 rounded-md border text-[15px] transition-colors disabled:opacity-40 ${
              item.meetingWanted
                ? "border-brand-amber bg-brand-amber text-white"
                : "border-brand-line bg-white text-brand-inkFaint hover:border-brand-amber"
            }`}
          >
            {item.meetingWanted ? "★" : "☆"}
          </button>
        </td>
      </tr>

      {open && (
        <tr className="border-l-[3px] border-brand-green bg-brand-greenTint">
          <td colSpan={7} className="px-4 py-4">
            <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
              {/* ---- the company (shared across shows) ---- */}
              <div>
                <p className="kicker">[ The company · shared across all shows ]</p>
                <h3 className="mt-1.5 font-heading text-lg font-bold text-brand-ink">
                  {item.vendor.name}
                </h3>

                <label className="label mt-3">What they do</label>
                <FieldEditor
                  value={item.vendor.description ?? ""}
                  multiline
                  disabled={!canManage || busy}
                  placeholder={canManage ? "Add a description…" : "No description on record"}
                  onSave={(v) => run(() => updateVendor(item.vendor.id, { description: v }, item.id))}
                />

                <label className="label mt-3">Tags</label>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => {
                    const on = item.vendor.tagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        disabled={!canManage || busy}
                        onClick={() =>
                          run(() =>
                            updateVendor(
                              item.vendor.id,
                              {
                                tagIds: on
                                  ? item.vendor.tagIds.filter((x) => x !== t.id)
                                  : [...item.vendor.tagIds, t.id],
                              },
                              item.id
                            )
                          )
                        }
                        className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 ${
                          on
                            ? "border-brand-greenDark bg-brand-green text-white"
                            : "border-brand-line bg-white text-brand-inkFaint hover:border-brand-green"
                        }`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                  {tags.length === 0 && (
                    <span className="text-xs text-brand-inkFaint">
                      No tags yet &mdash; an admin can add them in Settings.
                    </span>
                  )}
                </div>

                <label className="label mt-3">
                  Standing
                  {item.vendor.riskSource && item.vendor.riskSource !== "manual" && (
                    <span className="ml-2 normal-case tracking-normal text-brand-amber">
                      AI-generated · unverified
                    </span>
                  )}
                </label>
                <ScoreEditor
                  score={item.vendor.reputationScore}
                  notes={item.vendor.riskNotes}
                  source={item.vendor.riskSource}
                  disabled={!canAnnotate || busy}
                  onSave={(sc, n) => run(() => setVendorScore(item.vendor.id, sc, n, item.id))}
                />

                {item.vendor.sector && (
                  <p className="mt-1.5 text-[11.5px] text-brand-inkFaint">
                    Listed by the show as: {item.vendor.sector}
                  </p>
                )}

                <label className="label mt-3">Website</label>
                <FieldEditor
                  value={item.vendor.websiteUrl ?? ""}
                  disabled={!canManage || busy}
                  placeholder="No website on record"
                  onSave={(v) => run(() => updateVendor(item.vendor.id, { websiteUrl: v }, item.id))}
                />

                {item.vendor.contacts.length > 0 && (
                  <>
                    <label className="label mt-3">Contacts</label>
                    <div className="rounded-md border border-brand-line bg-white p-2.5 text-[12.5px]">
                      {item.vendor.contacts.map((c) => (
                        <div key={c.id} className="border-b border-dashed border-brand-line py-1 last:border-0">
                          <b>{c.name}</b>
                          {c.title ? ` · ${c.title}` : ""}
                          {c.email ? ` · ${c.email}` : ""}
                          {c.phone ? ` · ${c.phone}` : ""}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {item.vendor.history.length > 0 && (
                  <>
                    <label className="label mt-4">Where we&rsquo;ve seen them</label>
                    {item.vendor.history.map((h, i) => (
                      <div key={i} className="mb-2 border-l-2 border-brand-line pl-2.5 text-[12.5px] text-brand-inkSoft">
                        <b>
                          {h.showName} {h.year}
                        </b>
                        {h.booth ? ` · booth ${h.booth}` : ""} · {h.meetingStatus}
                        {h.notes && <div className="italic">&ldquo;{h.notes}&rdquo;</div>}
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* ---- this show only ---- */}
              <div>
                <p className="kicker">[ This show only ]</p>

                <div className="mt-2 flex gap-2">
                  <div className="w-[110px]">
                    <label className="label">Booth</label>
                    <FieldEditor
                      value={item.booth ?? ""}
                      disabled={!canAnnotate || busy}
                      placeholder="—"
                      onSave={(v) => run(() => updateExhibitor(item.id, { booth: v }))}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="label">Hall</label>
                    <FieldEditor
                      value={item.hall ?? ""}
                      disabled={!canAnnotate || busy}
                      placeholder="—"
                      onSave={(v) => run(() => updateExhibitor(item.id, { hall: v }))}
                    />
                  </div>
                </div>

                <div className="mt-3 rounded-md border border-[#F3DCC9] bg-[#FFFBF7] p-3">
                  <label className="flex items-center gap-2 text-[13.5px] font-semibold">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-amber"
                      checked={item.meetingWanted}
                      disabled={!canAnnotate || busy}
                      onChange={(e) => run(() => updateExhibitor(item.id, { meetingWanted: e.target.checked }))}
                    />
                    Want a meeting with them
                  </label>

                  {item.meetingWanted && (
                    <>
                      <label className="label mt-2.5">Status</label>
                      <select
                        className="input"
                        value={item.meetingStatus}
                        disabled={!canAnnotate || busy}
                        onChange={(e) => run(() => updateExhibitor(item.id, { meetingStatus: e.target.value }))}
                      >
                        {MEETING_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>

                      <label className="label mt-2.5">What it&rsquo;s about</label>
                      <div className="max-h-32 overflow-y-auto rounded-md border border-brand-line bg-white p-2">
                        {projects.map((p) => (
                          <label key={p.id} className="flex items-center gap-2 py-0.5 text-[12.5px]">
                            <input
                              type="checkbox"
                              className="accent-brand-green"
                              checked={item.projectIds.includes(p.id)}
                              disabled={!canAnnotate || busy}
                              onChange={(e) =>
                                run(() =>
                                  updateExhibitor(item.id, {
                                    projectIds: e.target.checked
                                      ? [...item.projectIds, p.id]
                                      : item.projectIds.filter((x) => x !== p.id),
                                  })
                                )
                              }
                            />
                            {p.title}
                          </label>
                        ))}
                        {projects.length === 0 && (
                          <span className="text-xs text-brand-inkFaint">No active projects.</span>
                        )}
                      </div>

                      <label className="label mt-2.5">Who&rsquo;s chasing it</label>
                      <div className="max-h-32 overflow-y-auto rounded-md border border-brand-line bg-white p-2">
                        {team.map((m) => (
                          <label key={m.id} className="flex items-center gap-2 py-0.5 text-[12.5px]">
                            <input
                              type="checkbox"
                              className="accent-brand-green"
                              checked={item.ownerIds.includes(m.id)}
                              disabled={!canAnnotate || busy}
                              onChange={(e) =>
                                run(() =>
                                  updateExhibitor(item.id, {
                                    ownerIds: e.target.checked
                                      ? [...item.ownerIds, m.id]
                                      : item.ownerIds.filter((x) => x !== m.id),
                                  })
                                )
                              }
                            />
                            {m.name}
                          </label>
                        ))}
                      </div>
                      <p className="mt-1 text-[11.5px] text-brand-inkFaint">
                        Everyone ticked gets this in their own Tasks list.
                      </p>
                    </>
                  )}
                </div>

                <label className="label mt-3">What we want out of it</label>
                <FieldEditor
                  value={item.notes ?? ""}
                  multiline
                  disabled={!canAnnotate || busy}
                  placeholder="Add a note for this show…"
                  onSave={(v) => run(() => updateExhibitor(item.id, { notes: v }))}
                />

                <label className="label mt-3">Notes from the floor</label>
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="What they said…"
                    value={note}
                    disabled={!canAnnotate || busy}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && note.trim()) {
                        run(() => addExhibitorNote(item.id, note));
                        setNote("");
                      }
                    }}
                  />
                  <button
                    className="btn-primary"
                    disabled={!canAnnotate || busy || !note.trim()}
                    onClick={() => {
                      run(() => addExhibitorNote(item.id, note));
                      setNote("");
                    }}
                  >
                    Add
                  </button>
                </div>
                <p className="mt-1 text-[11.5px] text-brand-inkFaint">
                  Notes are kept separately with who wrote them, so two people at the same booth
                  can&rsquo;t overwrite each other.
                </p>

                {item.noteEntries.map((n) => (
                  <div key={n.id} className="mt-2 border-l-2 border-brand-line pl-2.5 text-[12.5px] text-brand-inkSoft">
                    <b>{n.authorName}</b>{" "}
                    <span className="text-brand-inkFaint">
                      {new Date(n.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <div>{n.body}</div>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Click-to-edit field that only calls the server when the value actually
 * changed. Without that check, merely opening and closing a row would fire a
 * write per field and fill the activity log with edits nobody made.
 */
function FieldEditor({
  value,
  onSave,
  multiline,
  disabled,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const dirty = draft !== value;

  const common = {
    className: "input",
    value: draft,
    placeholder,
    disabled,
    onChange: (e: any) => setDraft(e.target.value),
    onBlur: () => {
      if (dirty) onSave(draft);
    },
  };

  return (
    <div>
      {multiline ? <textarea rows={3} {...common} /> : <input {...common} />}
      {dirty && !disabled && (
        <div className="mt-1 text-[11px] text-brand-amber">Unsaved &mdash; click away to save.</div>
      )}
    </div>
  );
}

/**
 * Score + risk note editor.
 *
 * Saving here sets riskSource="manual", which is the whole point: it is how a
 * number somebody actually checked becomes distinguishable from one a model
 * produced. The "?" on an AI score disappears once a person confirms it.
 */
function ScoreEditor({
  score,
  notes,
  source,
  disabled,
  onSave,
}: {
  score: number | null;
  notes: string | null;
  source: string | null;
  disabled?: boolean;
  onSave: (score: number | null, notes: string | null) => void;
}) {
  const [s, setS] = useState(score === null ? "" : String(score));
  const [n, setN] = useState(notes ?? "");
  const dirty = s !== (score === null ? "" : String(score)) || n !== (notes ?? "");

  return (
    <div>
      <div className="flex gap-2">
        <input
          className="input max-w-[92px]"
          inputMode="numeric"
          placeholder="—"
          value={s}
          disabled={disabled}
          onChange={(e) => setS(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
        />
        <input
          className="input"
          placeholder={source ? "" : "Not assessed yet"}
          value={n}
          disabled={disabled}
          onChange={(e) => setN(e.target.value)}
        />
      </div>
      {dirty && !disabled && (
        <button
          className="btn-primary mt-1.5 text-xs"
          onClick={() => {
            const v = s.trim() === "" ? null : Math.max(0, Math.min(100, Number(s)));
            onSave(v, n.trim() || null);
          }}
        >
          Save as checked
        </button>
      )}
      {score === null && source && (
        <p className="mt-1 text-[11.5px] text-brand-inkFaint">
          Not recognised by the model &mdash; left blank rather than guessed.
        </p>
      )}
    </div>
  );
}

function AddCompany({
  showId,
  tags,
  busy,
  onDone,
  onError,
}: {
  showId: string;
  tags: { id: string; name: string }[];
  busy: boolean;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [booth, setBooth] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  return (
    <div className="card mb-5 p-4">
      <p className="kicker mb-2">[ Add one company ]</p>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="label">Company name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Booth</label>
          <input className="input" value={booth} onChange={(e) => setBooth(e.target.value)} />
        </div>
        <div>
          <label className="label">Website</label>
          <input className="input" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
        </div>
        <div className="md:col-span-4">
          <label className="label">What they do</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <button
            key={t.id}
            onClick={() => setTagIds((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))}
            className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
              tagIds.includes(t.id)
                ? "border-brand-greenDark bg-brand-green text-white"
                : "border-brand-line bg-white text-brand-inkFaint"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          className="btn-primary"
          disabled={busy || !name.trim()}
          onClick={() =>
            startTransition(async () => {
              try {
                const r = await addExhibitorManually(showId, {
                  name,
                  booth,
                  description,
                  websiteUrl,
                  tagIds,
                });
                if (r.alreadyPresent) onError(`"${name}" is already on this show's list.`);
                setName("");
                setBooth("");
                setDescription("");
                setWebsiteUrl("");
                setTagIds([]);
                onDone();
              } catch (e: any) {
                onError(e?.message ?? "Could not add that company.");
              }
            })
          }
        >
          Add to this show
        </button>
        <button className="btn-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The band a score falls in, and what that band actually means. */
export function scoreBand(score: number): { label: string; meaning: string; cls: string } {
  if (score >= 85)
    return {
      label: "Established",
      meaning: "Major established firm, long track record, no meaningful concerns.",
      cls: "bg-[#E7F3E4] text-brand-greenDark border-[#cfe3ca]",
    };
  if (score >= 70)
    return {
      label: "Solid",
      meaning: "Known and solid. Ordinary commercial risk.",
      cls: "bg-[#E7F3E4] text-brand-greenDark border-[#cfe3ca]",
    };
  if (score >= 50)
    return {
      label: "Thin",
      meaning: "Small, young, narrow, or little is known beyond that it exists.",
      cls: "bg-[#FFF3E0] text-[#B45309] border-[#F0DCB0]",
    };
  if (score >= 25)
    return {
      label: "Concerns",
      meaning: "Real concerns, or very little substance behind the name.",
      cls: "bg-[#FDE8E8] text-[#B91C1C] border-[#F3C4C4]",
    };
  return {
    label: "Serious concerns",
    meaning: "Serious, well-documented problems.",
    cls: "bg-[#FDE8E8] text-[#B91C1C] border-[#F3C4C4]",
  };
}

/**
 * The score cell.
 *
 * A blank is deliberately shown as a dash and not a zero — "not assessed" and
 * "scored zero" mean opposite things, and rendering them the same way is how a
 * list like this starts lying to you. The "?" marks a score no human has
 * confirmed.
 */
function ScoreBadge({
  item,
  onOpen,
}: {
  item: ExhibitorItem;
  onOpen: (item: ExhibitorItem) => void;
}) {
  const score = item.vendor.reputationScore;
  const assessed = !!item.vendor.riskAssessedAt;
  const verified = item.vendor.riskSource === "manual";

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item);
      }}
      title={
        score === null
          ? assessed
            ? "Assessed — company not recognised. Click for detail."
            : "Not assessed yet. Click to score it."
          : verified
            ? "Checked by a person. Click for detail."
            : "AI-generated, unverified. Click for detail."
      }
      className={`w-full rounded-md border px-1.5 py-1 text-center font-mono text-[12px] font-bold transition-colors hover:brightness-95 ${
        score === null
          ? "border-brand-line bg-white text-brand-inkFaint"
          : scoreBand(score).cls
      }`}
    >
      {score === null ? (assessed ? "n/r" : "—") : score}
      {score !== null && !verified && <span className="opacity-50">?</span>}
    </button>
  );
}

/**
 * What the score means, where it came from, and how to overrule it.
 *
 * Shown on click rather than hover because the provenance line is the important
 * part and people need time to read it. An unverified AI score and a number
 * somebody checked look similar in a table; they are not similar, and this panel
 * is where that difference is made explicit.
 */
function ScoreDetail({
  item,
  canAnnotate,
  busy,
  onClose,
  onSave,
}: {
  item: ExhibitorItem;
  canAnnotate: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (score: number | null, notes: string | null) => void;
}) {
  const v = item.vendor;
  const [draft, setDraft] = useState(v.reputationScore === null ? "" : String(v.reputationScore));
  const [notes, setNotes] = useState(v.riskNotes ?? "");
  const verified = v.riskSource === "manual";
  const assessed = !!v.riskAssessedAt;
  const band = v.reputationScore !== null ? scoreBand(v.reputationScore) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-16"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg bg-white p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="kicker">[ Standing ]</p>
            <h3 className="mt-1 font-heading text-lg font-bold text-brand-ink">{v.name}</h3>
          </div>
          <button className="btn-secondary text-xs" onClick={onClose}>
            Close
          </button>
        </div>

        {v.reputationScore !== null && band ? (
          <div className={`mt-4 rounded-md border p-3 ${band.cls}`}>
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-3xl font-extrabold">{v.reputationScore}</span>
              <span className="font-mono text-xs font-bold uppercase tracking-wider">
                {band.label}
              </span>
            </div>
            <p className="mt-1 text-[12.5px]">{band.meaning}</p>
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-brand-line bg-white p-3">
            <div className="font-heading text-base font-bold text-brand-ink">
              {assessed ? "Not recognised" : "Not assessed yet"}
            </div>
            <p className="mt-1 text-[12.5px] text-brand-inkSoft">
              {assessed
                ? "The model was asked about this company and didn't recognise it, so it returned no score rather than a polite guess. That's the honest answer — score it yourself below if you know them."
                : "Nobody has scored this company. Run “Assess with AI”, or set a score by hand below."}
            </p>
          </div>
        )}

        {v.riskNotes && (
          <div className="mt-3">
            <span className="label">Note</span>
            <p className="text-[13px] text-brand-inkSoft">{v.riskNotes}</p>
          </div>
        )}

        <div className="mt-3 rounded-md border border-brand-line bg-brand-greenTint p-3 text-[12.5px]">
          <span className="label">Where this came from</span>
          {verified ? (
            <p className="text-brand-inkSoft">
              Set by hand{v.riskAssessedByName ? ` by ${v.riskAssessedByName}` : ""}
              {v.riskAssessedAt
                ? ` on ${new Date(v.riskAssessedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                : ""}
              . Treat it as checked.
            </p>
          ) : assessed ? (
            <p className="text-brand-inkSoft">
              <b className="text-brand-amber">AI-generated and unverified.</b> Produced by DeepSeek
              from its training data
              {v.riskAssessedAt
                ? ` on ${new Date(v.riskAssessedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                : ""}
              . It is an impression, not research &mdash; there are no sources behind it and it
              can&rsquo;t see anything recent. Don&rsquo;t quote it to anyone. Overwrite it below
              once you know better; that marks it checked and removes the &ldquo;?&rdquo;.
            </p>
          ) : (
            <p className="text-brand-inkSoft">Nothing yet.</p>
          )}
        </div>

        <div className="mt-4">
          <span className="label">How the scale works</span>
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              {[
                ["85–100", "Established", "Major firm, long track record, no meaningful concerns"],
                ["70–84", "Solid", "Known and solid, ordinary commercial risk"],
                ["50–69", "Thin", "Small, young, narrow, or little known"],
                ["25–49", "Concerns", "Real concerns, or very little substance"],
                ["0–24", "Serious concerns", "Well-documented problems"],
                ["blank", "Not assessed / not recognised", "No opinion recorded — deliberately not a zero"],
              ].map(([range, label, meaning]) => (
                <tr key={range} className="border-b border-[#EEEEEA] last:border-0">
                  <td className="py-1 pr-2 font-mono font-bold text-brand-ink">{range}</td>
                  <td className="py-1 pr-2 font-semibold text-brand-inkSoft">{label}</td>
                  <td className="py-1 text-brand-inkFaint">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canAnnotate && (
          <div className="mt-4 border-t border-brand-line pt-3">
            <span className="label">Set it yourself</span>
            <div className="flex gap-2">
              <input
                className="input max-w-[92px]"
                inputMode="numeric"
                placeholder="—"
                value={draft}
                disabled={busy}
                onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
              />
              <input
                className="input"
                placeholder="What you actually know about them"
                value={notes}
                disabled={busy}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                className="btn-primary text-xs"
                disabled={busy}
                onClick={() =>
                  onSave(
                    draft.trim() === "" ? null : Math.max(0, Math.min(100, Number(draft))),
                    notes.trim() || null
                  )
                }
              >
                Save as checked
              </button>
              <span className="text-[11.5px] text-brand-inkFaint">
                Leave the number blank to clear it back to &ldquo;no opinion&rdquo;.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
