"use client";

import { useState, useTransition } from "react";
import { saveRebates } from "@/lib/actions";
import { FEDERAL_INCENTIVES, rebateResearchLinks } from "@/lib/geo";

type Rebate = {
  name: string;
  authority: string;
  category: string;
  incentiveType: string;
  value: number;
  estimatedAmount: number;
  status: string;
  sourceUrl: string;
  notes: string;
};

const CATEGORIES = ["Solar", "BESS", "EV", "Efficiency", "Other"];
const TYPES = ["Percentage", "PerWatt", "Fixed", "PerKWh"];
const STATUSES = ["Researching", "Eligible", "Applied", "Awarded", "Denied"];
const STATUS_COLOR: Record<string, string> = {
  Researching: "#8A8A85",
  Eligible: "#4CAB3E",
  Applied: "#E8743B",
  Awarded: "#3F9634",
  Denied: "#C0392B",
};

const BLANK: Rebate = {
  name: "", authority: "State", category: "Solar", incentiveType: "Percentage",
  value: 0, estimatedAmount: 0, status: "Researching", sourceUrl: "", notes: "",
};

function money(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export default function RebatePanel({
  projectId,
  state,
  initial,
  canEdit,
}: {
  projectId: string;
  state: string | null;
  initial: Rebate[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<Rebate[]>(initial);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const links = rebateResearchLinks(state);

  const totalAwarded = rows.filter((r) => r.status === "Awarded").reduce((a, r) => a + (Number(r.estimatedAmount) || 0), 0);
  const totalPotential = rows.filter((r) => ["Eligible", "Applied", "Awarded"].includes(r.status)).reduce((a, r) => a + (Number(r.estimatedAmount) || 0), 0);

  function update(i: number, patch: Partial<Rebate>) {
    setRows((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setMsg(null);
  }

  function addFederal() {
    const existing = new Set(rows.map((r) => r.name));
    const toAdd = FEDERAL_INCENTIVES.filter((f) => !existing.has(f.name)).map((f) => ({
      ...BLANK, name: f.name, authority: f.authority, category: f.category,
      incentiveType: f.incentiveType, value: f.value, notes: f.notes, sourceUrl: f.sourceUrl,
      status: "Researching",
    }));
    if (toAdd.length === 0) { setMsg("Federal incentives already added."); return; }
    setRows([...rows, ...toAdd]);
    setMsg(`Added ${toAdd.length} federal incentive${toAdd.length === 1 ? "" : "s"} — verify rates and eligibility before quoting.`);
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      try {
        await saveRebates(projectId, rows);
        setMsg("Saved.");
      } catch (e: any) {
        setMsg(e?.message || "Couldn't save.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-brand-line bg-brand-greenTint p-3">
        <p className="text-xs text-brand-inkSoft">
          <strong className="text-brand-ink">These figures are not auto-detected.</strong> There&rsquo;s no free,
          reliable database of state and utility incentives by address — so rather than guess at numbers you might quote
          a client, this tracks what you verify yourself. Federal ITC rates can be pre-filled because they&rsquo;re
          statutory. Use the research links below for state and utility programs.
        </p>
      </div>

      <div>
        <p className="kicker mb-2">Research {state ? `— ${state}` : ""}</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer"
               className="block p-2.5 rounded-md border border-brand-line bg-white hover:border-brand-green transition-colors">
              <p className="text-xs font-semibold text-brand-greenDark">{l.label} →</p>
              <p className="text-[11px] text-brand-inkFaint mt-0.5">{l.note}</p>
            </a>
          ))}
        </div>
        {!state && (
          <p className="text-[11px] text-brand-amber mt-2">
            Set the project&rsquo;s state in Site Details to filter these links automatically.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-brand-line rounded-md p-3">
          <p className="font-mono text-[9px] font-bold tracking-widest text-brand-greenDark uppercase">Awarded</p>
          <p className="font-heading text-lg font-extrabold text-brand-ink">{money(totalAwarded)}</p>
        </div>
        <div className="bg-white border border-brand-line rounded-md p-3">
          <p className="font-mono text-[9px] font-bold tracking-widest text-brand-greenDark uppercase">Eligible + Applied + Awarded</p>
          <p className="font-heading text-lg font-extrabold text-brand-ink">{money(totalPotential)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="border border-brand-line rounded-md bg-white p-3 space-y-2">
            <div className="flex items-start gap-2">
              {canEdit ? (
                <input className="input flex-1 text-sm" value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Incentive name" />
              ) : (
                <p className="flex-1 font-semibold text-sm text-brand-ink">{r.name}</p>
              )}
              <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-mono font-bold text-white" style={{ backgroundColor: STATUS_COLOR[r.status] }}>
                {r.status.toUpperCase()}
              </span>
              {canEdit && (
                <button onClick={() => setRows(rows.filter((_, x) => x !== i))} className="w-6 h-6 rounded border border-brand-line text-brand-inkFaint hover:text-red-600 shrink-0">×</button>
              )}
            </div>

            {canEdit ? (
              <div className="grid sm:grid-cols-5 gap-2">
                <select className="input text-xs" value={r.authority} onChange={(e) => update(i, { authority: e.target.value })}>
                  {["Federal", "State", "Utility", "Local"].map((a) => <option key={a}>{a}</option>)}
                </select>
                <select className="input text-xs" value={r.category} onChange={(e) => update(i, { category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
                <select className="input text-xs" value={r.incentiveType} onChange={(e) => update(i, { incentiveType: e.target.value })}>
                  {TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
                <input type="number" step="any" className="input text-xs" value={r.value} onChange={(e) => update(i, { value: Number(e.target.value) })} placeholder="Rate" />
                <select className="input text-xs" value={r.status} onChange={(e) => update(i, { status: e.target.value })}>
                  {STATUSES.map((st) => <option key={st}>{st}</option>)}
                </select>
              </div>
            ) : (
              <p className="text-xs text-brand-inkSoft">
                {r.authority} · {r.category} · {r.value}
                {r.incentiveType === "Percentage" ? "%" : ""} · Est. {money(r.estimatedAmount)}
              </p>
            )}

            {canEdit && (
              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <label className="label !text-[10px]">Estimated $ value</label>
                  <input type="number" step="any" className="input text-xs" value={r.estimatedAmount} onChange={(e) => update(i, { estimatedAmount: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="label !text-[10px]">Source URL</label>
                  <input className="input text-xs" value={r.sourceUrl} onChange={(e) => update(i, { sourceUrl: e.target.value })} placeholder="Link to the program page" />
                </div>
              </div>
            )}

            {canEdit ? (
              <textarea className="input text-xs" rows={2} value={r.notes} onChange={(e) => update(i, { notes: e.target.value })} placeholder="Eligibility notes, deadlines, requirements…" />
            ) : (
              r.notes && <p className="text-[11px] italic text-brand-inkSoft">{r.notes}</p>
            )}

            {!canEdit && r.sourceUrl && (
              <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-brand-greenDark hover:underline">Source →</a>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-brand-inkFaint">No incentives tracked yet.</p>}
      </div>

      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setRows([...rows, { ...BLANK }])} className="btn-secondary text-xs">+ Add Incentive</button>
          <button onClick={addFederal} className="btn-secondary text-xs">+ Pre-fill Federal ITC</button>
          <button onClick={save} disabled={isPending} className="btn-primary text-xs">
            {isPending ? "Saving…" : "Save Incentives"}
          </button>
          {msg && <span className="text-xs text-brand-greenDark">{msg}</span>}
        </div>
      )}
    </div>
  );
}
