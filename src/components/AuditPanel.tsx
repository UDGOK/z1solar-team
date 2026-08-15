"use client";

import { useState, useTransition } from "react";
import { formatInstantDate, formatDateTime } from "@/lib/time";
import { runReconciliation, previewRestore, confirmRestore } from "@/lib/actions";

export type AuditEntry = {
  id: string; entityType: string; entityLabel: string; action: string;
  summary: string; isFinancial: boolean; actorName: string; createdAt: string;
  changes: { field: string; from: unknown; to: unknown }[] | null;
};

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function when(iso: string) {
  const d = new Date(iso);
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return formatInstantDate(d);
}

export default function AuditPanel({
  entries, canReconcile, canRepair, canRestore, lastRun,
}: {
  entries: AuditEntry[];
  canReconcile: boolean;
  canRepair: boolean;
  canRestore: boolean;
  lastRun: { runByName: string; driftFound: number; driftRepaired: number; createdAt: string } | null;
}) {
  const [tab, setTab] = useState<"log" | "financial" | "tools">("log");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [drift, setDrift] = useState<any[] | null>(null);
  const [plan, setPlan] = useState<any | null>(null);
  const [fileJson, setFileJson] = useState<string>("");
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();

  const list = tab === "financial" ? entries.filter((e) => e.isFinancial) : entries;

  function act(fn: () => Promise<any>) {
    setError(null); setMsg(null);
    startTransition(async () => {
      try { await fn(); }
      catch (e: any) { setError(e?.message || "Something went wrong."); }
    });
  }

  async function readFile(f: File | null) {
    if (!f) return;
    setError(null); setPlan(null);
    const text = await f.text();
    setFileJson(text);
    act(async () => {
      const p = await previewRestore(text);
      setPlan(p);
      if (!p.valid) setError(p.error || "Couldn't read that file.");
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-brand-line overflow-x-auto">
        {[
          { k: "log" as const, l: "All activity", n: entries.length },
          { k: "financial" as const, l: "Financial changes", n: entries.filter((e) => e.isFinancial).length },
          { k: "tools" as const, l: "Integrity & restore", n: 0 },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.k ? "border-brand-green text-brand-ink" : "border-transparent text-brand-inkFaint hover:text-brand-inkSoft"}`}>
            {t.l}
            {t.n > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-brand-greenTint text-brand-greenDark text-[10px] font-bold">{t.n}</span>}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-brand-greenDark">{msg}</p>}

      {tab === "tools" ? (
        <div className="space-y-4">
          <div className="card p-5 bg-white">
            <p className="kicker mb-1">Financial integrity check</p>
            <p className="text-xs text-brand-inkFaint mb-3">
              Recomputes each project&rsquo;s committed and actual spend from its line items and compares
              against the stored totals. Read-only until you choose to apply corrections.
            </p>
            {lastRun && (
              <p className="text-[11px] text-brand-inkFaint mb-3">
                Last run {when(lastRun.createdAt)} by {lastRun.runByName} — {lastRun.driftFound} discrepanc
                {lastRun.driftFound === 1 ? "y" : "ies"} found, {lastRun.driftRepaired} corrected.
              </p>
            )}
            {canReconcile && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => act(async () => {
                    const r = await runReconciliation(false);
                    setDrift(r.drift);
                    setMsg(r.driftCount === 0
                      ? `Checked ${r.checked} projects — everything reconciles.`
                      : `Checked ${r.checked} projects — ${r.driftCount} discrepanc${r.driftCount === 1 ? "y" : "ies"} found.`);
                  })}
                  disabled={isPending}
                  className="btn-secondary text-xs"
                >
                  {isPending ? "Checking…" : "Run check"}
                </button>
                {canRepair && drift && drift.length > 0 && (
                  <button
                    onClick={() => {
                      if (!confirm(`Correct ${drift.length} project total(s) to match their line items? Every change is written to the audit log.`)) return;
                      act(async () => {
                        const r = await runReconciliation(true);
                        setDrift([]);
                        setMsg(`Corrected ${r.repaired} project total(s).`);
                      });
                    }}
                    disabled={isPending}
                    className="btn-primary text-xs"
                  >
                    Apply corrections
                  </button>
                )}
              </div>
            )}

            {drift && drift.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {drift.map((d) => (
                  <div key={d.projectId} className="rounded bg-orange-50 border border-orange-200 p-2.5">
                    <p className="text-xs font-semibold text-brand-ink">{d.projectTitle}</p>
                    <p className="text-[11px] text-brand-amber">
                      Committed: stored {money(d.storedCommitted)} vs line items {money(d.computedCommitted)}
                      {Math.abs(d.committedDiff) > 0.01 && <> — off by {money(Math.abs(d.committedDiff))}</>}
                    </p>
                    {Math.abs(d.actualDiff) > 0.01 && (
                      <p className="text-[11px] text-brand-amber">
                        Actual: stored {money(d.storedActual)} vs {money(d.computedActual)} — off by {money(Math.abs(d.actualDiff))}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {canRestore && (
            <div className="card p-5 bg-white">
              <p className="kicker mb-1">Restore from backup</p>
              <p className="text-xs text-brand-inkFaint mb-3">
                Restore only <span className="font-semibold">adds records that are missing</span>. Nothing existing
                is overwritten or deleted, so it can&rsquo;t undo work done since the backup was taken.
                Passwords and invite links are never restored.
              </p>
              <input type="file" accept=".json,application/json" onChange={(e) => readFile(e.target.files?.[0] ?? null)} className="text-xs mb-3" />

              {plan?.valid && (
                <div className="space-y-3">
                  {plan.backupDate && (
                    <p className="text-[11px] text-brand-inkFaint">
                      Backup taken {formatDateTime(plan.backupDate)}
                    </p>
                  )}
                  <div className="border border-brand-line rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-brand-ink text-white text-left">
                          <th className="px-3 py-1.5 font-mono text-[9px] tracking-widest">TABLE</th>
                          <th className="px-3 py-1.5 font-mono text-[9px] tracking-widest text-right">IN BACKUP</th>
                          <th className="px-3 py-1.5 font-mono text-[9px] tracking-widest text-right">ALREADY THERE</th>
                          <th className="px-3 py-1.5 font-mono text-[9px] tracking-widest text-right">WOULD ADD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.tables.map((t: any) => (
                          <tr key={t.table} className="border-t border-brand-line">
                            <td className="px-3 py-1.5">{t.table}</td>
                            <td className="px-3 py-1.5 text-right text-brand-inkFaint">{t.inBackup}</td>
                            <td className="px-3 py-1.5 text-right text-brand-inkFaint">{t.alreadyPresent}</td>
                            <td className="px-3 py-1.5 text-right font-semibold" style={{ color: t.wouldCreate ? "#2F7328" : "#B4B2A9" }}>
                              {t.wouldCreate}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {plan.warnings.map((w: string, i: number) => (
                    <p key={i} className="text-[11px] text-brand-inkFaint">· {w}</p>
                  ))}

                  {plan.totalWouldCreate > 0 && (
                    <div className="rounded bg-orange-50 border border-orange-200 p-3">
                      <p className="text-xs font-semibold text-brand-amber mb-2">
                        This will add {plan.totalWouldCreate} record(s). Type RESTORE to confirm.
                      </p>
                      <div className="flex gap-2 items-center flex-wrap">
                        <input className="input !py-1 text-xs !w-32" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTORE" />
                        <button
                          onClick={() => act(async () => {
                            const r = await confirmRestore(fileJson, confirmText);
                            setMsg(`Restored ${r.totalCreated} record(s). ${r.skipped} already existed.${r.errors.length ? ` ${r.errors.length} could not be restored.` : ""}`);
                            setPlan(null); setConfirmText(""); setFileJson("");
                          })}
                          disabled={isPending || confirmText.trim().toUpperCase() !== "RESTORE"}
                          className="btn-primary text-xs"
                        >
                          {isPending ? "Restoring…" : "Restore now"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-brand-line rounded-md overflow-hidden">
          {list.map((e) => (
            <div key={e.id} className="px-4 py-2.5 border-b border-brand-line last:border-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-brand-greenTint text-brand-greenDark">
                      {e.action}
                    </span>
                    {e.isFinancial && (
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-white" style={{ background: "#E8743B" }}>
                        FINANCIAL
                      </span>
                    )}
                    <span className="text-[10px] text-brand-inkFaint">{e.entityType}</span>
                    <span className="text-xs font-semibold text-brand-ink">{e.entityLabel}</span>
                  </div>
                  <p className="text-[13px] text-brand-inkSoft">{e.summary}</p>
                  <p className="text-[10px] text-brand-inkFaint mt-0.5">{e.actorName}</p>
                </div>
                <span className="text-[10px] text-brand-inkFaint shrink-0">{when(e.createdAt)}</span>
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <div className="p-10 text-center">
              <p className="text-sm text-brand-inkSoft">
                {tab === "financial" ? "No financial changes recorded yet." : "No activity recorded yet."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
