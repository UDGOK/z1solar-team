"use client";

import { useState, useMemo, useTransition } from "react";
import { daysUntil as daysUntilCT, isPastDate } from "@/lib/time";
import TradeShowCard, { type TradeShowItem } from "./TradeShowCard";
import TradeShowForm from "./TradeShowForm";
import { setTradeShowAccess } from "@/lib/actions";

type AccessRow = { id: string; name: string; canView: boolean; canManage: boolean; isAdmin: boolean };

export default function TradeShowsHub({
  shows,
  teamMembers,
  currentMemberId,
  canManage,
  isAdmin,
  accessRows,
}: {
  shows: TradeShowItem[];
  teamMembers: { id: string; name: string }[];
  currentMemberId: string;
  canManage: boolean;
  isAdmin: boolean;
  accessRows: AccessRow[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TradeShowItem | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past" | "mine">("upcoming");
  const [priority, setPriority] = useState("");
  const [showAccess, setShowAccess] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { upcoming, past, mine } = useMemo(() => {
    const up: TradeShowItem[] = [];
    const pa: TradeShowItem[] = [];
    for (const s of shows) {
      // "Upcoming" is decided in Central: a show ending today is still upcoming
      // for the whole of that day, wherever the person looking happens to be.
      const ref = s.endDate || s.startDate;
      (isPastDate(ref) ? pa : up).push(s);
    }
    up.sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));
    pa.sort((a, b) => +new Date(b.startDate) - +new Date(a.startDate));
    const mi = up.filter((s) =>
      s.attendees.some((a) => a.memberId === currentMemberId && a.status !== "Declined")
    );
    return { upcoming: up, past: pa, mine: mi };
  }, [shows, currentMemberId]);

  const base = tab === "upcoming" ? upcoming : tab === "past" ? past : mine;
  const list = priority ? base.filter((s) => s.priority === priority) : base;

  // Shows worth chasing: high priority, within 45 days, nobody confirmed.
  const gaps = upcoming.filter((s) => {
    const d = daysUntilCT(s.startDate) ?? 0;
    return s.priority === "High" && d <= 45 && !s.attendees.some((a) => a.status === "Confirmed");
  });

  const next = upcoming[0];
  // Anchored to Central, so the countdown reads the same for everyone.
  const nextDays = next ? daysUntilCT(next.startDate) : null;

  function startEdit(s: TradeShowItem) {
    setEditing(s);
    setShowForm(true);
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Upcoming" value={String(upcoming.length)} />
        <Stat label="I'm attending" value={String(mine.length)} />
        <Stat label="High priority" value={String(upcoming.filter((s) => s.priority === "High").length)} />
        <Stat
          label="Needs coverage"
          value={String(gaps.length)}
          tone={gaps.length ? "bad" : "ok"}
        />
      </div>

      {next && nextDays !== null && (
        <div className="rounded-md bg-brand-ink text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-mono text-[10px] tracking-widest text-brand-green">NEXT UP</p>
            <p className="font-heading font-bold text-lg leading-tight">{next.name}</p>
          </div>
          <p className="font-heading text-2xl font-extrabold">
            {nextDays === 0 ? "TODAY" : nextDays === 1 ? "TOMORROW" : `${nextDays} days`}
          </p>
        </div>
      )}

      {canManage && (
        <div className="flex gap-2 flex-wrap">
          {!showForm && (
            <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary text-sm">
              + Add Trade Show
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setShowAccess(!showAccess)} className="btn-secondary text-sm">
              {showAccess ? "Hide access settings" : "Access settings"}
            </button>
          )}
        </div>
      )}

      {showForm && <TradeShowForm editing={editing} onClose={() => { setShowForm(false); setEditing(null); }} />}

      {isAdmin && showAccess && <AccessPanel rows={accessRows} />}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-brand-line overflow-x-auto">
        {[
          { key: "upcoming" as const, label: "Upcoming", n: upcoming.length },
          { key: "mine" as const, label: "I'm Attending", n: mine.length },
          { key: "past" as const, label: "Past", n: past.length },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-brand-green text-brand-ink" : "border-transparent text-brand-inkFaint hover:text-brand-inkSoft"
            }`}
          >
            {t.label}
            {t.n > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-brand-greenTint text-brand-greenDark text-[10px] font-bold">
                {t.n}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <select className="input !py-1.5 text-xs !w-auto" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          {["High", "Medium", "Low"].map((p) => <option key={p}>{p}</option>)}
        </select>
        <span className="text-xs text-brand-inkFaint ml-auto">{list.length} shown</span>
      </div>

      <div className="space-y-3">
        {list.map((s) => (
          <TradeShowCard
            key={s.id}
            show={s}
            teamMembers={teamMembers}
            currentMemberId={currentMemberId}
            canManage={canManage}
            onEdit={startEdit}
          />
        ))}
        {list.length === 0 && (
          <div className="card p-10 text-center bg-white">
            <p className="text-sm text-brand-inkSoft">
              {tab === "upcoming"
                ? "No upcoming shows yet."
                : tab === "mine"
                ? "You're not down for any upcoming shows."
                : "No past shows recorded."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AccessPanel({ rows }: { rows: AccessRow[] }) {
  const [state, setState] = useState(rows);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function update(id: string, canView: boolean, canManage: boolean) {
    setState((p) => p.map((r) => (r.id === id ? { ...r, canView: canView || canManage, canManage } : r)));
    setSavingId(id);
    startTransition(async () => {
      await setTradeShowAccess(id, canView, canManage);
      setSavingId(null);
    });
  }

  return (
    <div className="card p-5 bg-white">
      <p className="kicker mb-2">Trade Shows Access</p>
      <p className="text-xs text-brand-inkFaint mb-3">
        Who can see this section, and who can add or edit shows. Admins always have full access.
        Granting &ldquo;manage&rdquo; automatically grants view.
      </p>
      <div className="space-y-1.5">
        {state.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-brand-line last:border-0">
            <span className="text-sm font-semibold text-brand-ink">
              {r.name}
              {r.isAdmin && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white bg-brand-amber">ADMIN</span>}
              {savingId === r.id && <span className="ml-2 text-[11px] text-brand-inkFaint">saving…</span>}
            </span>
            {r.isAdmin ? (
              <span className="text-[11px] text-brand-inkFaint">full access</span>
            ) : (
              <span className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={r.canView}
                    onChange={(e) => update(r.id, e.target.checked, e.target.checked ? r.canManage : false)}
                    className="w-3.5 h-3.5 accent-[#4CAB3E]"
                  />
                  <span className="text-brand-inkSoft">View</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={r.canManage}
                    onChange={(e) => update(r.id, r.canView, e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#E8743B]"
                  />
                  <span className="text-brand-inkSoft">Manage</span>
                </label>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "ok" }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="bg-white border border-brand-line rounded-md p-3">
      <p className="font-mono text-[9px] font-bold tracking-widest text-brand-greenDark uppercase">{label}</p>
      <p className="font-heading text-xl font-extrabold" style={{ color: tone === "bad" ? "#C0392B" : "#1C1C1C" }}>
        {value}
      </p>
    </div>
  );
}
