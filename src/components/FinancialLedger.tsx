"use client";

import { useState, useTransition, useMemo } from "react";
import { saveLineItems } from "@/lib/actions";

type Row = {
  category: string;
  description: string;
  vendor: string;
  qty: number;
  unitCost: number;
  actualAmount: number;
  invoiceRef: string;
  paidDate: string;
  status: string;
  notes: string;
};

const STATUSES = ["Planned", "Committed", "Invoiced", "Paid"];
const STATUS_COLOR: Record<string, string> = {
  Planned: "#8A8A85",
  Committed: "#E8743B",
  Invoiced: "#3F9634",
  Paid: "#4CAB3E",
};

function money(n: number) {
  return "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const BLANK: Row = {
  category: "General",
  description: "",
  vendor: "",
  qty: 1,
  unitCost: 0,
  actualAmount: 0,
  invoiceRef: "",
  paidDate: "",
  status: "Planned",
  notes: "",
};

export default function FinancialLedger({
  projectId,
  initial,
  canEdit,
}: {
  projectId: string;
  initial: Row[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : canEdit ? [{ ...BLANK }] : []);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setSaved(false);
  }
  function remove(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  // Live formulas — recomputed on every keystroke, same math the server
  // re-derives on save so the two can't disagree.
  const totals = useMemo(() => {
    const budget = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitCost) || 0), 0);
    const actual = rows.reduce((s, r) => s + (Number(r.actualAmount) || 0), 0);
    const committed = rows
      .filter((r) => ["Committed", "Invoiced", "Paid"].includes(r.status))
      .reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitCost) || 0), 0);
    const paid = rows.filter((r) => r.status === "Paid").reduce((s, r) => s + (Number(r.actualAmount) || 0), 0);
    return { budget, actual, committed, paid, variance: budget - actual, outstanding: actual - paid };
  }, [rows]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { budget: number; actual: number }>();
    for (const r of rows) {
      const k = r.category || "General";
      const cur = map.get(k) || { budget: 0, actual: 0 };
      cur.budget += (Number(r.qty) || 0) * (Number(r.unitCost) || 0);
      cur.actual += Number(r.actualAmount) || 0;
      map.set(k, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].budget - a[1].budget);
  }, [rows]);

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await saveLineItems(projectId, rows);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch (e: any) {
        setError(e?.message || "Couldn't save.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Sum label="Budget" value={money(totals.budget)} />
        <Sum label="Committed" value={money(totals.committed)} />
        <Sum label="Actual" value={money(totals.actual)} />
        <Sum label="Paid" value={money(totals.paid)} />
        <Sum label="Outstanding" value={money(totals.outstanding)} tone={totals.outstanding > 0 ? "warn" : "ok"} />
        <Sum
          label="Variance"
          value={money(Math.abs(totals.variance))}
          tone={totals.variance < 0 ? "bad" : "ok"}
          sub={totals.variance < 0 ? "over budget" : "under budget"}
        />
      </div>

      {/* Ledger */}
      <div className="bg-white border border-brand-line rounded-md overflow-x-auto">
        <table className="w-full text-xs min-w-[1000px]">
          <thead>
            <tr className="bg-brand-ink text-white text-left">
              <th className="px-2 py-2 font-mono text-[10px] tracking-widest">CATEGORY</th>
              <th className="px-2 py-2 font-mono text-[10px] tracking-widest">DESCRIPTION</th>
              <th className="px-2 py-2 font-mono text-[10px] tracking-widest">VENDOR</th>
              <th className="px-2 py-2 font-mono text-[10px] tracking-widest text-right">QTY</th>
              <th className="px-2 py-2 font-mono text-[10px] tracking-widest text-right">UNIT COST</th>
              <th className="px-2 py-2 font-mono text-[10px] tracking-widest text-right">BUDGET</th>
              <th className="px-2 py-2 font-mono text-[10px] tracking-widest text-right">ACTUAL</th>
              <th className="px-2 py-2 font-mono text-[10px] tracking-widest text-right">VARIANCE</th>
              <th className="px-2 py-2 font-mono text-[10px] tracking-widest">STATUS</th>
              <th className="px-2 py-2 font-mono text-[10px] tracking-widest">INVOICE</th>
              {canEdit && <th className="px-2 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const budget = (Number(r.qty) || 0) * (Number(r.unitCost) || 0);
              const variance = budget - (Number(r.actualAmount) || 0);
              return (
                <tr key={i} className={`border-t border-brand-line ${i % 2 ? "bg-brand-greenTint" : ""}`}>
                  <td className="px-2 py-1">
                    {canEdit ? (
                      <input className="input !py-1 !px-1.5 text-xs w-28" value={r.category} onChange={(e) => update(i, { category: e.target.value })} />
                    ) : (
                      r.category
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {canEdit ? (
                      <input className="input !py-1 !px-1.5 text-xs w-48" value={r.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="Line item" />
                    ) : (
                      r.description
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {canEdit ? (
                      <input className="input !py-1 !px-1.5 text-xs w-28" value={r.vendor} onChange={(e) => update(i, { vendor: e.target.value })} />
                    ) : (
                      r.vendor || "—"
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {canEdit ? (
                      <input type="number" step="any" className="input !py-1 !px-1.5 text-xs w-16 text-right" value={r.qty} onChange={(e) => update(i, { qty: Number(e.target.value) })} />
                    ) : (
                      r.qty
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {canEdit ? (
                      <input type="number" step="any" className="input !py-1 !px-1.5 text-xs w-24 text-right" value={r.unitCost} onChange={(e) => update(i, { unitCost: Number(e.target.value) })} />
                    ) : (
                      money(r.unitCost)
                    )}
                  </td>
                  {/* Derived — never directly editable */}
                  <td className="px-2 py-1 text-right font-semibold text-brand-ink bg-brand-greenTint/60">{money(budget)}</td>
                  <td className="px-2 py-1 text-right">
                    {canEdit ? (
                      <input type="number" step="any" className="input !py-1 !px-1.5 text-xs w-24 text-right" value={r.actualAmount} onChange={(e) => update(i, { actualAmount: Number(e.target.value) })} />
                    ) : (
                      money(r.actualAmount)
                    )}
                  </td>
                  <td className={`px-2 py-1 text-right font-semibold ${variance < 0 ? "text-red-600" : "text-brand-inkSoft"}`}>
                    {money(variance)}
                  </td>
                  <td className="px-2 py-1">
                    {canEdit ? (
                      <select className="input !py-1 !px-1.5 text-xs w-28" value={r.status} onChange={(e) => update(i, { status: e.target.value })}>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-white" style={{ backgroundColor: STATUS_COLOR[r.status] }}>
                        {r.status}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {canEdit ? (
                      <input className="input !py-1 !px-1.5 text-xs w-24" value={r.invoiceRef} onChange={(e) => update(i, { invoiceRef: e.target.value })} />
                    ) : (
                      r.invoiceRef || "—"
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-2 py-1">
                      <button onClick={() => remove(i)} className="w-6 h-6 rounded border border-brand-line text-brand-inkFaint hover:text-red-600" title="Remove">×</button>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 11 : 10} className="px-4 py-8 text-center text-brand-inkFaint">
                  No line items yet.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-brand-ink text-white font-bold">
              <td className="px-2 py-2" colSpan={5}>TOTAL</td>
              <td className="px-2 py-2 text-right">{money(totals.budget)}</td>
              <td className="px-2 py-2 text-right">{money(totals.actual)}</td>
              <td className="px-2 py-2 text-right">{money(totals.variance)}</td>
              <td colSpan={canEdit ? 3 : 2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {canEdit && (
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setRows([...rows, { ...BLANK }])} className="btn-secondary text-xs">
            + Add Line Item
          </button>
          <button onClick={save} disabled={isPending} className="btn-primary text-xs">
            {isPending ? "Saving…" : saved ? "Saved ✓" : "Save Ledger"}
          </button>
          <a href={`/api/projects/${projectId}/financials-pdf`} className="btn-secondary text-xs" download>
            ↓ Export PDF
          </a>
          {error && <span className="text-xs text-red-600">{error}</span>}
          <span className="text-[11px] text-brand-inkFaint">
            Budget and Variance are calculated — edit Qty, Unit Cost, and Actual.
          </span>
        </div>
      )}

      {/* Category rollup */}
      {byCategory.length > 0 && (
        <div className="bg-white border border-brand-line rounded-md p-4">
          <p className="kicker mb-3">By Category</p>
          <div className="space-y-2">
            {byCategory.map(([cat, v]) => {
              const max = Math.max(...byCategory.map((c) => c[1].budget), 1);
              return (
                <div key={cat} className="flex items-center gap-3 text-xs">
                  <span className="w-28 shrink-0 text-brand-inkSoft truncate">{cat}</span>
                  <div className="flex-1 h-4 bg-brand-greenTint rounded overflow-hidden relative">
                    <div className="h-full bg-brand-greenDark/30" style={{ width: `${(v.budget / max) * 100}%` }} />
                    <div className="h-full bg-brand-green absolute top-0 left-0" style={{ width: `${(v.actual / max) * 100}%` }} />
                  </div>
                  <span className="w-24 text-right text-brand-inkFaint">{money(v.budget)}</span>
                  <span className="w-24 text-right font-semibold">{money(v.actual)}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-brand-inkFaint mt-2">Light bar = budget · Solid bar = actual spend</p>
        </div>
      )}
    </div>
  );
}

function Sum({ label, value, sub, tone = "ok" }: { label: string; value: string; sub?: string; tone?: "ok" | "bad" | "warn" }) {
  const color = tone === "bad" ? "#C0392B" : tone === "warn" ? "#E8743B" : "#1C1C1C";
  return (
    <div className="bg-white border border-brand-line rounded-md p-3">
      <p className="font-mono text-[9px] font-bold tracking-widest text-brand-greenDark uppercase">{label}</p>
      <p className="font-heading text-base font-extrabold" style={{ color }}>{value}</p>
      {sub && <p className="text-[9px] text-brand-inkFaint">{sub}</p>}
    </div>
  );
}
