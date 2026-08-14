"use client";

import { useState, useMemo, useTransition } from "react";
import MeetingCard, { type MeetingItem } from "./MeetingCard";
import { saveMeeting, saveAgendaItems, setMeetingAttendees } from "@/lib/actions";

export default function MeetingsHub({
  meetings,
  teamMembers,
  projects,
  currentMemberId,
  canManage,
  noteRights,
}: {
  meetings: MeetingItem[];
  teamMembers: { id: string; name: string }[];
  projects: { id: string; title: string }[];
  currentMemberId: string;
  canManage: boolean;
  noteRights: Record<string, boolean>;
}) {
  const [tab, setTab] = useState<"upcoming" | "mine" | "past">("upcoming");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MeetingItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [f, setF] = useState({ title: "", description: "", startsAt: "", durationMins: 60, location: "", joinUrl: "", projectId: "" });
  const [agenda, setAgenda] = useState<string[]>(["", "", ""]);
  const [invited, setInvited] = useState<string[]>([]);

  const { upcoming, past, mine } = useMemo(() => {
    const up: MeetingItem[] = [];
    const pa: MeetingItem[] = [];
    for (const m of meetings) {
      const end = new Date(m.startsAt).getTime() + m.durationMins * 60000;
      (end >= Date.now() ? up : pa).push(m);
    }
    up.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    pa.sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
    return { upcoming: up, past: pa, mine: up.filter((m) => m.attendees.some((a) => a.memberId === currentMemberId)) };
  }, [meetings, currentMemberId]);

  const list = tab === "upcoming" ? upcoming : tab === "mine" ? mine : past;
  const next = upcoming[0];
  const missingNotes = past.filter((m) => !m.notes).length;

  function reset() {
    setF({ title: "", description: "", startsAt: "", durationMins: 60, location: "", joinUrl: "", projectId: "" });
    setAgenda(["", "", ""]);
    setInvited([]);
    setEditing(null);
    setShowForm(false);
  }

  function startEdit(m: MeetingItem) {
    setEditing(m);
    setF({
      title: m.title, description: m.description ?? "",
      startsAt: new Date(m.startsAt).toISOString().slice(0, 16),
      durationMins: m.durationMins, location: m.location ?? "", joinUrl: m.joinUrl ?? "", projectId: "",
    });
    setAgenda(m.agenda.length ? m.agenda.map((a) => a.text) : ["", "", ""]);
    setInvited(m.attendees.map((a) => a.memberId));
    setShowForm(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await saveMeeting(editing?.id ?? null, { ...f, projectId: f.projectId || null });
        await saveAgendaItems(res.id, agenda.filter((t) => t.trim()).map((t) => ({ text: t })));
        await setMeetingAttendees(res.id, invited);
        reset();
      } catch (err: any) {
        setError(err?.message || "Couldn't save the meeting.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Upcoming" value={upcoming.length} />
        <Stat label="I'm invited to" value={mine.length} />
        <Stat label="Held" value={past.length} />
        <Stat label="Missing notes" value={missingNotes} tone={missingNotes ? "bad" : "ok"} />
      </div>

      {next && (
        <div className="rounded-md bg-brand-ink text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-mono text-[10px] tracking-widest text-brand-green">NEXT MEETING</p>
            <p className="font-heading font-bold text-lg leading-tight">{next.title}</p>
            <p className="text-[11px] text-white/70 mt-0.5">
              {new Date(next.startsAt).toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
          {next.joinUrl && (
            <a href={next.joinUrl} target="_blank" rel="noreferrer" className="bg-brand-green text-white text-xs font-semibold px-3 py-2 rounded">
              Join →
            </a>
          )}
        </div>
      )}

      {canManage && !showForm && (
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Schedule Meeting</button>
      )}

      {showForm && (
        <form onSubmit={submit} className="card p-5 bg-white space-y-4">
          <p className="kicker">{editing ? "Edit Meeting" : "Schedule Meeting"}</p>
          <div>
            <label className="label">Title</label>
            <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Weekly operations review" autoFocus />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Date &amp; time</label>
              <input type="datetime-local" className="input" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
            </div>
            <div>
              <label className="label">Duration (min)</label>
              <input type="number" className="input" value={f.durationMins} onChange={(e) => setF({ ...f, durationMins: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label">Related project</label>
              <select className="input" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
                <option value="">— none —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Join link</label>
              <input className="input" value={f.joinUrl} onChange={(e) => setF({ ...f, joinUrl: e.target.value })} placeholder="https://meet.google.com/…" />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Tulsa office / Zoom" />
            </div>
          </div>
          <div>
            <label className="label">What are we covering?</label>
            <textarea className="input" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </div>
          <div>
            <label className="label">Agenda</label>
            {agenda.map((a, i) => (
              <input
                key={i}
                className="input mb-1.5"
                value={a}
                onChange={(e) => setAgenda(agenda.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`Item ${i + 1}`}
              />
            ))}
            <button type="button" onClick={() => setAgenda([...agenda, ""])} className="text-xs font-semibold text-brand-greenDark hover:underline">
              + Add agenda item
            </button>
          </div>
          <div>
            <label className="label">Invite</label>
            <div className="flex flex-wrap gap-1.5">
              {teamMembers.map((m) => {
                const on = invited.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setInvited(on ? invited.filter((x) => x !== m.id) : [...invited, m.id])}
                    className={`px-2 py-1 rounded text-xs font-semibold border transition-colors ${
                      on ? "bg-brand-green text-white border-brand-green" : "bg-white text-brand-inkSoft border-brand-line hover:bg-brand-greenTint"
                    }`}
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="btn-primary text-sm">
              {isPending ? "Saving…" : editing ? "Save changes" : "Schedule meeting"}
            </button>
            <button type="button" onClick={reset} className="btn-secondary text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="flex gap-1 border-b border-brand-line overflow-x-auto">
        {[
          { k: "upcoming" as const, l: "Upcoming", n: upcoming.length },
          { k: "mine" as const, l: "I'm Invited", n: mine.length },
          { k: "past" as const, l: "Past", n: past.length },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.k ? "border-brand-green text-brand-ink" : "border-transparent text-brand-inkFaint hover:text-brand-inkSoft"
            }`}
          >
            {t.l}
            {t.n > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-brand-greenTint text-brand-greenDark text-[10px] font-bold">{t.n}</span>}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {list.map((m) => (
          <MeetingCard
            key={m.id}
            meeting={m}
            currentMemberId={currentMemberId}
            canManage={canManage}
            canEditNotes={!!noteRights[m.id]}
            onEdit={startEdit}
          />
        ))}
        {list.length === 0 && (
          <div className="card p-10 text-center bg-white">
            <p className="text-sm text-brand-inkSoft">
              {tab === "upcoming" ? "Nothing scheduled yet." : tab === "mine" ? "You're not invited to any upcoming meetings." : "No past meetings recorded."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "ok" }: { label: string; value: number; tone?: "ok" | "bad" }) {
  return (
    <div className="bg-white border border-brand-line rounded-md p-3">
      <p className="font-mono text-[9px] font-bold tracking-widest text-brand-greenDark uppercase">{label}</p>
      <p className="font-heading text-xl font-extrabold" style={{ color: tone === "bad" ? "#C0392B" : "#1C1C1C" }}>{value}</p>
    </div>
  );
}
