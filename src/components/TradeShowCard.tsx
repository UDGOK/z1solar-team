"use client";

import { useState, useTransition } from "react";
import { setTradeShowAttendance, removeTradeShowAttendee, deleteTradeShow } from "@/lib/actions";

export type ShowAttendee = {
  memberId: string;
  name: string;
  status: string;
  role: string | null;
};

export type TradeShowItem = {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  timeInfo: string | null;
  venue: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  websiteUrl: string | null;
  registrationUrl: string | null;
  registrationDeadline: string | null;
  priority: string;
  status: string;
  boothInfo: string | null;
  estimatedCost: number;
  notes: string | null;
  attendees: ShowAttendee[];
};

const PRIORITY: Record<string, { color: string; label: string }> = {
  High: { color: "#C0392B", label: "HIGH" },
  Medium: { color: "#E8743B", label: "MEDIUM" },
  Low: { color: "#8A8A85", label: "LOW" },
};

const STATUS_COLOR: Record<string, string> = {
  Considering: "#8A8A85",
  Registered: "#E8743B",
  Attending: "#4CAB3E",
  Attended: "#3F9634",
  Skipped: "#C0392B",
};

const RSVP_COLOR: Record<string, string> = {
  Confirmed: "#4CAB3E",
  Tentative: "#E8743B",
  Declined: "#8A8A85",
};

function daysUntil(iso: string): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

function countdownLabel(days: number): { text: string; tone: "past" | "urgent" | "soon" | "far" } {
  if (days < 0) return { text: `${Math.abs(days)}d ago`, tone: "past" };
  if (days === 0) return { text: "TODAY", tone: "urgent" };
  if (days === 1) return { text: "TOMORROW", tone: "urgent" };
  if (days <= 14) return { text: `IN ${days} DAYS`, tone: "urgent" };
  if (days <= 45) return { text: `IN ${days} DAYS`, tone: "soon" };
  return { text: `IN ${days} DAYS`, tone: "far" };
}

const TONE_BG: Record<string, string> = {
  past: "#8A8A85",
  urgent: "#C0392B",
  soon: "#E8743B",
  far: "#4CAB3E",
};

function dateRange(start: string, end: string | null): string {
  const s = new Date(start);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (!end) return s.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  const e = new Date(end);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  return sameMonth
    ? `${s.toLocaleDateString("en-US", opts)}–${e.getDate()}, ${e.getFullYear()}`
    : `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

export default function TradeShowCard({
  show,
  teamMembers,
  currentMemberId,
  canManage,
  onEdit,
}: {
  show: TradeShowItem;
  teamMembers: { id: string; name: string }[];
  currentMemberId: string;
  canManage: boolean;
  onEdit: (s: TradeShowItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addId, setAddId] = useState("");
  const [addRole, setAddRole] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const days = daysUntil(show.startDate);
  const cd = countdownLabel(days);
  const isPast = days < 0;
  const pri = PRIORITY[show.priority] || PRIORITY.Medium;

  const confirmed = show.attendees.filter((a) => a.status === "Confirmed");
  const tentative = show.attendees.filter((a) => a.status === "Tentative");
  const mine = show.attendees.find((a) => a.memberId === currentMemberId);

  // The signal worth surfacing loudly: an important show, soon, with nobody committed.
  const coverageGap = !isPast && show.priority === "High" && confirmed.length === 0 && days <= 45;

  // Registration deadline is what actually bites — flag it before it passes.
  const regDays = show.registrationDeadline ? daysUntil(show.registrationDeadline) : null;
  const regUrgent = regDays !== null && regDays >= 0 && regDays <= 21 && !isPast;
  const regPassed = regDays !== null && regDays < 0 && !isPast;

  const location = [show.venue, show.city, show.state].filter(Boolean).join(", ") || show.country || "";

  function rsvp(status: string) {
    setError(null);
    startTransition(async () => {
      try {
        await setTradeShowAttendance(show.id, currentMemberId, { status });
      } catch (e: any) {
        setError(e?.message || "Couldn't update.");
      }
    });
  }

  function addAttendee() {
    if (!addId) return;
    setError(null);
    startTransition(async () => {
      try {
        await setTradeShowAttendance(show.id, addId, { status: "Tentative", role: addRole });
        setAddId("");
        setAddRole("");
        setAdding(false);
      } catch (e: any) {
        setError(e?.message || "Couldn't add.");
      }
    });
  }

  function changeAttendee(memberId: string, status: string) {
    startTransition(async () => {
      try {
        await setTradeShowAttendance(show.id, memberId, { status });
      } catch (e: any) {
        setError(e?.message || "Couldn't update.");
      }
    });
  }

  function drop(memberId: string) {
    startTransition(async () => {
      try {
        await removeTradeShowAttendee(show.id, memberId);
      } catch (e: any) {
        setError(e?.message || "Couldn't remove.");
      }
    });
  }

  function removeShow() {
    if (!confirm(`Delete "${show.name}"? This can't be undone.`)) return;
    startTransition(async () => {
      try {
        await deleteTradeShow(show.id);
      } catch (e: any) {
        setError(e?.message || "Couldn't delete.");
      }
    });
  }

  return (
    <div
      className={`rounded-md bg-white overflow-hidden border border-brand-line ${isPast ? "opacity-70" : ""}`}
      style={{ borderLeftWidth: 5, borderLeftColor: pri.color }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider text-white"
                style={{ backgroundColor: TONE_BG[cd.tone] }}
              >
                {cd.text}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider text-white" style={{ backgroundColor: pri.color }}>
                {pri.label}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider text-white" style={{ backgroundColor: STATUS_COLOR[show.status] || "#8A8A85" }}>
                {show.status.toUpperCase()}
              </span>
            </div>
            <h3 className="font-heading text-lg font-extrabold text-brand-ink leading-tight">{show.name}</h3>
            <p className="text-xs text-brand-inkSoft mt-0.5">
              {dateRange(show.startDate, show.endDate)}
              {location && <> · {location}</>}
            </p>
          </div>
          <button onClick={() => setOpen(!open)} className="text-xs text-brand-inkFaint hover:text-brand-greenDark shrink-0">
            {open ? "▾ Less" : "▸ Details"}
          </button>
        </div>

        {/* Warnings */}
        {coverageGap && (
          <div className="mt-2 px-2.5 py-1.5 rounded bg-red-50 border border-red-200">
            <p className="text-[11px] text-red-700 font-semibold">
              ⚠ High priority, {days} days out, nobody confirmed yet.
            </p>
          </div>
        )}
        {regPassed && (
          <div className="mt-2 px-2.5 py-1.5 rounded bg-red-50 border border-red-200">
            <p className="text-[11px] text-red-700 font-semibold">
              ⚠ Registration deadline passed {Math.abs(regDays!)} days ago.
            </p>
          </div>
        )}
        {regUrgent && (
          <div className="mt-2 px-2.5 py-1.5 rounded bg-orange-50 border border-orange-200">
            <p className="text-[11px] text-brand-amber font-semibold">
              Registration closes in {regDays} day{regDays === 1 ? "" : "s"}.
            </p>
          </div>
        )}

        {/* Attendees */}
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[9px] font-bold tracking-widest text-brand-greenDark uppercase mr-1">
            Attending
          </span>
          {show.attendees.length === 0 && (
            <span className="text-xs text-brand-inkFaint italic">nobody yet</span>
          )}
          {show.attendees.map((a) => (
            <span
              key={a.memberId}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold text-white"
              style={{ backgroundColor: RSVP_COLOR[a.status] || "#8A8A85" }}
              title={`${a.status}${a.role ? ` · ${a.role}` : ""}`}
            >
              {a.name}
              {a.status === "Tentative" && <span className="opacity-80">?</span>}
              {a.status === "Declined" && <span className="opacity-80">✕</span>}
            </span>
          ))}
          {confirmed.length > 0 && (
            <span className="text-[10px] text-brand-inkFaint ml-1">
              {confirmed.length} confirmed{tentative.length > 0 && `, ${tentative.length} tentative`}
            </span>
          )}
        </div>

        {/* Own RSVP */}
        {!isPast && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-brand-inkFaint">You:</span>
            {["Confirmed", "Tentative", "Declined"].map((s) => (
              <button
                key={s}
                onClick={() => rsvp(s)}
                disabled={isPending}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                  mine?.status === s
                    ? "text-white border-transparent"
                    : "bg-white text-brand-inkSoft border-brand-line hover:bg-brand-greenTint"
                }`}
                style={mine?.status === s ? { backgroundColor: RSVP_COLOR[s] } : {}}
              >
                {s === "Confirmed" ? "Going" : s === "Tentative" ? "Maybe" : "Not going"}
              </button>
            ))}
            {mine && (
              <button onClick={() => drop(currentMemberId)} disabled={isPending} className="text-[11px] text-brand-inkFaint hover:underline">
                clear
              </button>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-brand-line pt-3 space-y-3">
          {show.description && <p className="text-sm text-brand-inkSoft leading-relaxed">{show.description}</p>}

          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            {show.timeInfo && <Detail label="Hours" value={show.timeInfo} />}
            {show.venue && <Detail label="Venue" value={show.venue} />}
            {show.boothInfo && <Detail label="Booth" value={show.boothInfo} />}
            {show.registrationDeadline && (
              <Detail
                label="Register by"
                value={new Date(show.registrationDeadline).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              />
            )}
            {show.estimatedCost > 0 && (
              <Detail label="Est. cost" value={`$${Math.round(show.estimatedCost).toLocaleString("en-US")}`} />
            )}
          </div>

          {(show.websiteUrl || show.registrationUrl) && (
            <div className="flex gap-2 flex-wrap">
              {show.websiteUrl && (
                <a href={show.websiteUrl} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
                  Show website →
                </a>
              )}
              {show.registrationUrl && (
                <a href={show.registrationUrl} target="_blank" rel="noreferrer" className="btn-primary text-xs">
                  Register →
                </a>
              )}
            </div>
          )}

          {show.notes && (
            <div className="rounded bg-brand-greenTint p-2.5">
              <p className="text-[11px] italic text-brand-inkSoft whitespace-pre-wrap">{show.notes}</p>
            </div>
          )}

          {canManage && (
            <div className="border-t border-brand-line pt-3 space-y-2">
              <p className="kicker">Manage attendees</p>
              {show.attendees.map((a) => (
                <div key={a.memberId} className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="w-24 font-semibold text-brand-ink truncate">{a.name}</span>
                  <select
                    className="input !py-0.5 !px-1.5 text-xs !w-auto"
                    value={a.status}
                    onChange={(e) => changeAttendee(a.memberId, e.target.value)}
                  >
                    {["Confirmed", "Tentative", "Declined"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  {a.role && <span className="text-brand-inkFaint">{a.role}</span>}
                  <button onClick={() => drop(a.memberId)} className="text-brand-inkFaint hover:text-red-600">×</button>
                </div>
              ))}

              {adding ? (
                <div className="flex items-end gap-2 flex-wrap">
                  <select className="input !py-1 text-xs !w-auto" value={addId} onChange={(e) => setAddId(e.target.value)}>
                    <option value="">Select person…</option>
                    {teamMembers
                      .filter((m) => !show.attendees.some((a) => a.memberId === m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </select>
                  <input
                    className="input !py-1 text-xs !w-32"
                    placeholder="Role (optional)"
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value)}
                  />
                  <button onClick={addAttendee} disabled={isPending} className="btn-primary !px-2 !py-1 text-xs">Add</button>
                  <button onClick={() => setAdding(false)} className="btn-secondary !px-2 !py-1 text-xs">×</button>
                </div>
              ) : (
                <button onClick={() => setAdding(true)} className="text-xs font-semibold text-brand-greenDark hover:underline">
                  + Add attendee
                </button>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => onEdit(show)} className="btn-secondary text-xs">Edit show</button>
                <button onClick={removeShow} disabled={isPending} className="btn-danger text-xs">Delete</button>
              </div>
            </div>
          )}
        </div>
      )}
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
