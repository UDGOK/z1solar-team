"use client";

import { useState, useTransition } from "react";
import { formatDateTime, formatInstantDate } from "@/lib/time";
import {
  setMeetingRsvp,
  saveMeetingNotes,
  toggleAgendaItem,
  deleteMeeting,
  setMeetingNoteTaker,
} from "@/lib/actions";

export type MeetingItem = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  durationMins: number;
  location: string | null;
  joinUrl: string | null;
  status: string;
  notes: string | null;
  notesBy: string | null;
  notesAt: string | null;
  organizerName: string | null;
  projectTitle: string | null;
  agenda: { id: string; text: string; covered: boolean; ownerName: string | null }[];
  attendees: { memberId: string; name: string; status: string; canEditNotes: boolean }[];
};

const RSVP_COLOR: Record<string, string> = {
  Accepted: "#4CAB3E",
  Attended: "#3F9634",
  Invited: "#8A8A85",
  Declined: "#C0392B",
};

function minutesUntil(iso: string) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

function countdown(iso: string, durationMins: number) {
  const m = minutesUntil(iso);
  if (m < -durationMins) return { text: "", tone: "past" as const };
  if (m <= 0) return { text: "IN PROGRESS", tone: "live" as const };
  if (m < 60) return { text: `IN ${m} MIN`, tone: "soon" as const };
  const h = Math.round(m / 60);
  if (h < 24) return { text: `IN ${h}H`, tone: "soon" as const };
  const d = Math.round(h / 24);
  return { text: `IN ${d} DAY${d === 1 ? "" : "S"}`, tone: "far" as const };
}

const TONE_BG: Record<string, string> = { live: "#C0392B", soon: "#E8743B", far: "#4CAB3E", past: "#8A8A85" };

export default function MeetingCard({
  meeting,
  currentMemberId,
  canManage,
  canEditNotes,
  onEdit,
}: {
  meeting: MeetingItem;
  currentMemberId: string;
  canManage: boolean;
  canEditNotes: boolean;
  onEdit: (m: MeetingItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(meeting.notes ?? "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const start = new Date(meeting.startsAt);
  const isPast = minutesUntil(meeting.startsAt) < -meeting.durationMins;
  const cd = countdown(meeting.startsAt, meeting.durationMins);
  const mine = meeting.attendees.find((a) => a.memberId === currentMemberId);
  const accepted = meeting.attendees.filter((a) => a.status === "Accepted" || a.status === "Attended");
  const covered = meeting.agenda.filter((a) => a.covered).length;

  function act(fn: () => Promise<any>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e: any) {
        setError(e?.message || "Something went wrong.");
      }
    });
  }

  return (
    <div
      className={`bg-white border rounded-md overflow-hidden ${isPast ? "border-brand-line opacity-80" : "border-brand-line"}`}
      style={!isPast ? { borderLeft: `4px solid ${TONE_BG[cd.tone]}` } : { borderLeft: "4px solid #E5E3DB" }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {cd.text && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider text-white" style={{ backgroundColor: TONE_BG[cd.tone] }}>
                  {cd.text}
                </span>
              )}
              {isPast && meeting.notes && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider text-white bg-brand-greenDark">NOTES ADDED</span>
              )}
              {isPast && !meeting.notes && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider text-white bg-brand-amber">NOTES MISSING</span>
              )}
              {meeting.projectTitle && (
                <span className="text-[10px] text-brand-inkFaint">· {meeting.projectTitle}</span>
              )}
            </div>
            <h3 className="font-heading text-lg font-extrabold text-brand-ink leading-tight">{meeting.title}</h3>
            <p className="text-xs text-brand-inkSoft mt-0.5">
              {formatDateTime(start, { weekday: "short", year: undefined })}
              {" · "}{meeting.durationMins} min
              {meeting.location && <> · {meeting.location}</>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {meeting.joinUrl && !isPast && (
              <a href={meeting.joinUrl} target="_blank" rel="noreferrer" className="btn-primary !text-[11px] !px-3 !py-1.5">
                Join →
              </a>
            )}
            <button onClick={() => setOpen(!open)} className="text-xs text-brand-inkFaint hover:text-brand-greenDark">
              {open ? "▾ Less" : "▸ Details"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[9px] font-bold tracking-widest text-brand-greenDark uppercase mr-1">Attending</span>
          {meeting.attendees.length === 0 && <span className="text-xs text-brand-inkFaint italic">nobody invited yet</span>}
          {meeting.attendees.map((a) => (
            <span
              key={a.memberId}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold text-white"
              style={{ backgroundColor: RSVP_COLOR[a.status] || "#8A8A85" }}
              title={`${a.status}${a.canEditNotes ? " · can take notes" : ""}`}
            >
              {a.name}
              {a.canEditNotes && <span className="opacity-80">✎</span>}
            </span>
          ))}
          {accepted.length > 0 && <span className="text-[10px] text-brand-inkFaint ml-1">{accepted.length} confirmed</span>}
        </div>

        {mine && !isPast && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-brand-inkFaint">You:</span>
            {["Accepted", "Declined"].map((s) => (
              <button
                key={s}
                onClick={() => act(() => setMeetingRsvp(meeting.id, currentMemberId, s))}
                disabled={isPending}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors ${
                  mine.status === s ? "text-white border-transparent" : "bg-white text-brand-inkSoft border-brand-line hover:bg-brand-greenTint"
                }`}
                style={mine.status === s ? { backgroundColor: RSVP_COLOR[s] } : {}}
              >
                {s === "Accepted" ? "Going" : "Can't make it"}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-brand-line pt-3 space-y-4">
          {meeting.description && <p className="text-sm text-brand-inkSoft leading-relaxed">{meeting.description}</p>}

          {meeting.agenda.length > 0 && (
            <div>
              <p className="kicker mb-1.5">
                Agenda {covered > 0 && <span className="text-brand-inkFaint font-normal">· {covered}/{meeting.agenda.length} covered</span>}
              </p>
              <div className="space-y-1">
                {meeting.agenda.map((item) => (
                  <label key={item.id} className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={item.covered}
                      onChange={(e) => act(() => toggleAgendaItem(item.id, e.target.checked))}
                      disabled={isPending}
                      className="w-3.5 h-3.5 mt-0.5 accent-[#4CAB3E]"
                    />
                    <span className={`text-sm flex-1 ${item.covered ? "line-through text-brand-inkFaint" : "text-brand-inkSoft"}`}>
                      {item.text}
                    </span>
                    {item.ownerName && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-greenTint text-brand-greenDark shrink-0">
                        {item.ownerName}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="kicker">Notes</p>
              {canEditNotes && !editingNotes && (
                <button onClick={() => setEditingNotes(true)} className="text-[11px] text-brand-greenDark hover:underline">
                  {meeting.notes ? "Edit notes" : "+ Add notes"}
                </button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <textarea
                  className="input"
                  rows={6}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What was decided? What happens next, and who owns it?"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => act(async () => { await saveMeetingNotes(meeting.id, notes); setEditingNotes(false); })}
                    disabled={isPending}
                    className="btn-primary text-xs"
                  >
                    {isPending ? "Saving…" : "Save notes"}
                  </button>
                  <button onClick={() => { setNotes(meeting.notes ?? ""); setEditingNotes(false); }} className="btn-secondary text-xs">
                    Cancel
                  </button>
                </div>
              </div>
            ) : meeting.notes ? (
              <div className="rounded bg-brand-greenTint p-3">
                <p className="text-sm text-brand-inkSoft whitespace-pre-wrap leading-relaxed">{meeting.notes}</p>
                {meeting.notesBy && (
                  <p className="text-[10px] text-brand-inkFaint mt-2">
                    — {meeting.notesBy}
                    {meeting.notesAt && <> · {formatInstantDate(meeting.notesAt)}</>}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-brand-inkFaint italic">
                {isPast ? "No notes recorded for this meeting yet." : "Notes can be added once the meeting has taken place."}
              </p>
            )}
          </div>

          {canManage && (
            <div className="border-t border-brand-line pt-3 space-y-2">
              <p className="kicker">Who can take notes</p>
              <p className="text-[11px] text-brand-inkFaint">
                Give one attendee note-taking rights for this meeting only, without changing their role.
              </p>
              <div className="space-y-1">
                {meeting.attendees.map((a) => (
                  <label key={a.memberId} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={a.canEditNotes}
                      onChange={(e) => act(() => setMeetingNoteTaker(meeting.id, a.memberId, e.target.checked))}
                      disabled={isPending}
                      className="w-3.5 h-3.5 accent-[#E8743B]"
                    />
                    <span className="text-brand-inkSoft">{a.name}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => onEdit(meeting)} className="btn-secondary text-xs">Edit meeting</button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${meeting.title}"? Agenda and notes go with it.`)) act(() => deleteMeeting(meeting.id));
                  }}
                  disabled={isPending}
                  className="btn-danger text-xs"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
