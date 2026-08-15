"use client";

import { useState, useMemo, useTransition } from "react";
import {
  savePurchase, submitPurchase, approvePurchase, rejectPurchase,
  advancePurchase, cancelPurchase, addPurchaseComment,
} from "@/lib/actions";

export type PurchaseItem = {
  id: string; number: number; title: string; description: string | null;
  category: string; projectId: string | null; projectTitle: string | null;
  vendor: string | null; quantity: number; unitCost: number; amount: number;
  neededBy: string | null; urgency: string; status: string;
  requestedByName: string | null; requestedById: string | null;
  approvedByName: string | null; secondApprovedByName: string | null;
  poNumber: string | null; invoiceRef: string | null;
  budget: number; committed: number;
  comments: { id: string; authorName: string; body: string; kind: string; createdAt: string }[];
  createdAt: string;
};

const CATEGORIES = [
  { key: "MATERIAL", label: "Material" },
  { key: "SUBCONTRACTOR", label: "Subcontractor" },
  { key: "TRADE_SHOW", label: "Trade show" },
  { key: "MARKETING", label: "Marketing" },
  { key: "SOFTWARE", label: "Software" },
  { key: "TRAVEL", label: "Travel" },
  { key: "OFFICE", label: "Office" },
  { key: "OTHER", label: "Other" },
];
const PROJECT_REQUIRED = ["MATERIAL", "SUBCONTRACTOR"];

const STATUS: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: "#F7F6F1", fg: "#8A8A85" },
  SUBMITTED: { bg: "#FAF3E8", fg: "#8B5A2B" },
  APPROVED: { bg: "#EAF3E7", fg: "#2F7328" },
  REJECTED: { bg: "#FBEDEA", fg: "#A32D2D" },
  ORDERED: { bg: "#EAF3E7", fg: "#3F9634" },
  RECEIVED: { bg: "#EAF3E7", fg: "#3F9634" },
  INVOICED: { bg: "#FAF3E8", fg: "#8B5A2B" },
  PAID: { bg: "#1C1C1C", fg: "#FFFFFF" },
  CANCELLED: { bg: "#F7F6F1", fg: "#B4B2A9" },
};

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function PurchasesHub({
  purchases, projects, tradeShows, currentMemberId, canRequest, canApprove, canRecordPayments,
}: {
  purchases: PurchaseItem[];
  projects: { id: string; title: string }[];
  tradeShows: { id: string; name: string }[];
  currentMemberId: string;
  canRequest: boolean;
  canApprove: boolean;
  canRecordPayments: boolean;
}) {
  const [tab, setTab] = useState<"pending" | "mine" | "all">("pending");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();

  const blank = { title: "", description: "", category: "MATERIAL", projectId: "", tradeShowId: "", vendor: "", quantity: 1, unitCost: 0, neededBy: "", urgency: "Normal" };
  const [f, setF] = useState({ ...blank });

  const pending = useMemo(() => purchases.filter((p) => p.status === "SUBMITTED"), [purchases]);
  const mine = useMemo(() => purchases.filter((p) => p.requestedById === currentMemberId), [purchases, currentMemberId]);
  const list = tab === "pending" ? pending : tab === "mine" ? mine : purchases;

  const pendingValue = pending.reduce((n, p) => n + p.amount, 0);
  const committedThis = purchases.filter((p) => ["APPROVED", "ORDERED", "RECEIVED", "INVOICED"].includes(p.status)).reduce((n, p) => n + p.amount, 0);

  function act(fn: () => Promise<any>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try { await fn(); after?.(); }
      catch (e: any) { setError(e?.message || "Something went wrong."); }
    });
  }

  const amount = (Number(f.quantity) || 0) * (Number(f.unitCost) || 0);
  const proj = projects.find((p) => p.id === f.projectId);
  const projPurchase = purchases.find((p) => p.projectId === f.projectId);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Awaiting approval" value={String(pending.length)} tone={pending.length ? "warn" : "ok"} />
        <Stat label="Pending value" value={money(pendingValue)} tone={pending.length ? "warn" : "ok"} />
        <Stat label="My requests" value={String(mine.length)} />
        <Stat label="Committed" value={money(committedThis)} />
      </div>

      {canRequest && !open && (
        <button onClick={() => { setF({ ...blank }); setEditing(null); setOpen(true); }} className="btn-primary text-sm">
          + New purchase request
        </button>
      )}

      {open && (
        <div className="card p-5 bg-white space-y-3">
          <p className="kicker">{editing ? "Edit request" : "New purchase request"}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">What are you buying?</label>
              <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="500ft 3in rigid conduit" autoFocus />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">
                Project {PROJECT_REQUIRED.includes(f.category) && <span className="text-brand-amber">· required</span>}
              </label>
              <select className="input" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
                <option value="">— none —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            {f.category === "TRADE_SHOW" && (
              <div>
                <label className="label">Trade show</label>
                <select className="input" value={f.tradeShowId} onChange={(e) => setF({ ...f, tradeShowId: e.target.value })}>
                  <option value="">— none —</option>
                  {tradeShows.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-4 gap-3">
            <div>
              <label className="label">Vendor</label>
              <input className="input" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} placeholder="Graybar" />
            </div>
            <div>
              <label className="label">Qty</label>
              <input type="number" step="any" className="input" value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Unit cost</label>
              <input type="number" step="any" className="input" value={f.unitCost} onChange={(e) => setF({ ...f, unitCost: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Total</label>
              <p className="font-heading font-extrabold text-[20px] text-brand-ink pt-1">{money(amount)}</p>
            </div>
          </div>

          {proj && amount > 0 && (
            <div className={`rounded p-3 ${projPurchase && false ? "" : "bg-brand-greenTint"}`}>
              <p className="text-[11px] text-brand-inkSoft">
                <span className="font-semibold">{proj.title}</span> — this request adds {money(amount)} in committed spend.
                The approver will see the full budget impact before signing off.
              </p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Needed by</label>
              <input type="date" className="input" value={f.neededBy} onChange={(e) => setF({ ...f, neededBy: e.target.value })} />
            </div>
            <div>
              <label className="label">Urgency</label>
              <select className="input" value={f.urgency} onChange={(e) => setF({ ...f, urgency: e.target.value })}>
                <option>Normal</option><option>Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Why is this needed?</label>
            <textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => act(async () => {
                const res = await savePurchase(editing, { ...f, projectId: f.projectId || null, tradeShowId: f.tradeShowId || null, neededBy: f.neededBy || null });
                await submitPurchase(res.id);
              }, () => { setF({ ...blank }); setOpen(false); setEditing(null); })}
              disabled={isPending}
              className="btn-primary text-sm"
            >
              {isPending ? "Submitting…" : "Submit for approval"}
            </button>
            <button
              onClick={() => act(() => savePurchase(editing, { ...f, projectId: f.projectId || null, tradeShowId: f.tradeShowId || null, neededBy: f.neededBy || null }),
                () => { setF({ ...blank }); setOpen(false); setEditing(null); })}
              disabled={isPending}
              className="btn-secondary text-sm"
            >
              Save as draft
            </button>
            <button onClick={() => { setOpen(false); setEditing(null); }} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {error && !open && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-1 border-b border-brand-line overflow-x-auto">
        {[
          { k: "pending" as const, l: "Awaiting approval", n: pending.length },
          { k: "mine" as const, l: "My requests", n: mine.length },
          { k: "all" as const, l: "All", n: purchases.length },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.k ? "border-brand-green text-brand-ink" : "border-transparent text-brand-inkFaint hover:text-brand-inkSoft"}`}>
            {t.l}
            {t.n > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-brand-greenTint text-brand-greenDark text-[10px] font-bold">{t.n}</span>}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {list.map((p) => {
          const st = STATUS[p.status] || STATUS.DRAFT;
          const isMine = p.requestedById === currentMemberId;
          const newCommitted = p.committed + p.amount;
          const pct = p.budget > 0 ? Math.round((newCommitted / p.budget) * 1000) / 10 : 0;
          const over = p.budget > 0 && newCommitted > p.budget;
          const canAct = canApprove && p.status === "SUBMITTED" && !isMine;
          return (
            <div key={p.id} className="bg-white border border-brand-line rounded-md">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-[10px] text-brand-inkFaint">PR-{String(p.number).padStart(4, "0")}</span>
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: st.bg, color: st.fg }}>{p.status}</span>
                      {p.urgency === "Urgent" && <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-white" style={{ background: "#C0392B" }}>URGENT</span>}
                      {p.projectTitle && <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-greenTint text-brand-greenDark">{p.projectTitle}</span>}
                      <span className="text-[10px] text-brand-inkFaint">{CATEGORIES.find((c) => c.key === p.category)?.label ?? p.category}</span>
                    </div>
                    <p className="font-semibold text-sm text-brand-ink">{p.title}</p>
                    <p className="text-[11px] text-brand-inkFaint mt-0.5">
                      {p.requestedByName ?? "—"}
                      {p.vendor && <> · {p.vendor}</>}
                      {p.quantity !== 1 && <> · {p.quantity} × {money(p.unitCost)}</>}
                      {p.neededBy && <> · needed {new Date(p.neededBy).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-heading font-extrabold text-[20px] text-brand-ink leading-none">{money(p.amount)}</p>
                    <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="text-[11px] text-brand-inkFaint hover:text-brand-greenDark mt-1">
                      {expanded === p.id ? "▾ Less" : "▸ Details"}
                    </button>
                  </div>
                </div>

                {canAct && p.projectId && p.budget > 0 && (
                  <div className={`mt-2.5 rounded p-2.5 ${over ? "bg-red-50 border border-red-200" : "bg-brand-greenTint"}`}>
                    <p className={`text-[11px] ${over ? "text-red-700 font-semibold" : "text-brand-inkSoft"}`}>
                      {over && "⚠ "}
                      {p.projectTitle}: budget {money(p.budget)} · committed {money(p.committed)} → <span className="font-semibold">{money(newCommitted)} ({pct}%)</span>
                      {over && ` — this puts the project ${money(newCommitted - p.budget)} over budget`}
                    </p>
                  </div>
                )}

                {canAct && (
                  <div className="mt-2.5 flex gap-2 items-center flex-wrap">
                    <input className="input !py-1 text-xs flex-1 min-w-[140px]" placeholder="Note (required to return)" value={note} onChange={(e) => setNote(e.target.value)} />
                    <button onClick={() => act(() => approvePurchase(p.id, note), () => setNote(""))} disabled={isPending} className="btn-primary !text-[11px] !px-3 !py-1.5">Approve</button>
                    <button onClick={() => act(() => rejectPurchase(p.id, note), () => setNote(""))} disabled={isPending} className="btn-danger !text-[11px] !px-3 !py-1.5">Return</button>
                  </div>
                )}

                {isMine && p.status === "SUBMITTED" && (
                  <p className="mt-2 text-[11px] text-brand-inkFaint italic">Waiting on someone else to approve — you can&rsquo;t sign off your own request.</p>
                )}

                {isMine && p.status === "DRAFT" && (
                  <div className="mt-2.5 flex gap-2">
                    <button onClick={() => act(() => submitPurchase(p.id))} disabled={isPending} className="btn-primary !text-[11px] !px-3 !py-1.5">Submit for approval</button>
                  </div>
                )}

                {["APPROVED", "ORDERED", "RECEIVED", "INVOICED"].includes(p.status) && (canApprove || isMine || canRecordPayments) && (
                  <div className="mt-2.5 flex gap-1.5 items-center flex-wrap">
                    <span className="text-[11px] text-brand-inkFaint">Next:</span>
                    {p.status === "APPROVED" && <button onClick={() => act(() => advancePurchase(p.id, "ORDERED"))} disabled={isPending} className="btn-secondary !text-[11px] !px-2.5 !py-1">Mark ordered</button>}
                    {p.status === "ORDERED" && <button onClick={() => act(() => advancePurchase(p.id, "RECEIVED"))} disabled={isPending} className="btn-secondary !text-[11px] !px-2.5 !py-1">Mark received</button>}
                    {p.status === "RECEIVED" && <button onClick={() => act(() => advancePurchase(p.id, "INVOICED"))} disabled={isPending} className="btn-secondary !text-[11px] !px-2.5 !py-1">Mark invoiced</button>}
                    {p.status === "INVOICED" && canRecordPayments && <button onClick={() => act(() => advancePurchase(p.id, "PAID"))} disabled={isPending} className="btn-primary !text-[11px] !px-2.5 !py-1">Mark paid</button>}
                  </div>
                )}
              </div>

              {expanded === p.id && (
                <div className="px-4 pb-4 border-t border-brand-line pt-3 space-y-3">
                  {p.description && <p className="text-sm text-brand-inkSoft">{p.description}</p>}
                  <div className="grid sm:grid-cols-3 gap-2 text-[11px]">
                    {p.approvedByName && <Detail label="Approved by" value={p.approvedByName} />}
                    {p.secondApprovedByName && <Detail label="Second approval" value={p.secondApprovedByName} />}
                    {p.poNumber && <Detail label="PO" value={p.poNumber} />}
                    {p.invoiceRef && <Detail label="Invoice" value={p.invoiceRef} />}
                  </div>

                  {p.comments.length > 0 && (
                    <div className="space-y-1.5 border-l-2 border-brand-line pl-3">
                      {p.comments.map((c) => (
                        <div key={c.id}>
                          <p className="text-[11px]">
                            <span className="font-semibold text-brand-ink">{c.authorName}</span>
                            {c.kind !== "COMMENT" && <span className="ml-1.5 font-semibold text-brand-greenDark">{c.kind.toLowerCase()}</span>}
                            <span className="text-brand-inkFaint ml-1.5">{new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                          </p>
                          <p className="text-[13px] text-brand-inkSoft">{c.body}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input className="input !py-1 text-xs flex-1" placeholder="Reply…" value={comment} onChange={(e) => setComment(e.target.value)} />
                    <button onClick={() => act(() => addPurchaseComment(p.id, comment), () => setComment(""))} disabled={isPending || !comment.trim()} className="btn-secondary !text-[11px] !px-3 !py-1.5">Send</button>
                  </div>

                  {!["PAID", "CANCELLED"].includes(p.status) && (isMine || canApprove) && (
                    <button onClick={() => { if (confirm("Cancel this request? Any committed budget is released.")) act(() => cancelPurchase(p.id)); }}
                      className="text-[11px] text-brand-inkFaint hover:text-red-600">Cancel request</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <div className="card p-10 text-center bg-white">
            <p className="text-sm text-brand-inkSoft">
              {tab === "pending" ? "Nothing waiting on approval." : tab === "mine" ? "You haven't raised any requests." : "No purchase requests yet."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] font-bold tracking-widest text-brand-greenDark uppercase">{label}</p>
      <p className="text-brand-inkSoft">{value}</p>
    </div>
  );
}

function Stat({ label, value, tone = "ok" }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="bg-white border border-brand-line rounded-md p-3">
      <p className="font-mono text-[9px] font-bold tracking-widest text-brand-greenDark uppercase">{label}</p>
      <p className="font-heading text-xl font-extrabold" style={{ color: tone === "warn" ? "#E8743B" : "#1C1C1C" }}>{value}</p>
    </div>
  );
}
