"use client";

import { useState, useTransition } from "react";
import { sendMessage } from "@/lib/actions";

export default function ComposeMessage({
  teamMembers,
  isAdmin,
}: {
  teamMembers: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"MESSAGE" | "ALERT">("MESSAGE");
  const [priority, setPriority] = useState("Normal");
  const [toAll, setToAll] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      try {
        await sendMessage({
          subject,
          body,
          kind,
          priority,
          recipientIds: toAll ? [] : selected,
        });
        setSubject("");
        setBody("");
        setSelected([]);
        setToAll(true);
        setKind("MESSAGE");
        setPriority("Normal");
        setOpen(false);
        setMsg({ type: "ok", text: "Sent." });
      } catch (e: any) {
        setMsg({ type: "err", text: e?.message || "Couldn't send." });
      }
    });
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <button onClick={() => setOpen(true)} className="btn-primary text-sm">
          ✉ New Message
        </button>
        {msg && (
          <span className={`text-xs ${msg.type === "err" ? "text-red-600" : "text-brand-greenDark"}`}>{msg.text}</span>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-5 bg-white space-y-4">
      <p className="kicker">Compose</p>

      {isAdmin && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setKind("MESSAGE")}
            className={`flex-1 py-2 rounded-md text-sm font-semibold border ${
              kind === "MESSAGE" ? "bg-brand-green text-white border-brand-green" : "bg-white text-brand-inkSoft border-brand-line"
            }`}
          >
            Message
          </button>
          <button
            type="button"
            onClick={() => setKind("ALERT")}
            className={`flex-1 py-2 rounded-md text-sm font-semibold border ${
              kind === "ALERT" ? "bg-brand-amber text-white border-brand-amber" : "bg-white text-brand-inkSoft border-brand-line"
            }`}
          >
            ⚠ Alert (must acknowledge)
          </button>
        </div>
      )}

      {kind === "ALERT" && (
        <div className="rounded-md bg-brand-greenTint border border-brand-line p-3">
          <p className="text-xs text-brand-inkSoft">
            Alerts pop up as a blocking dialog the next time each person opens the app, and stay until they click
            &ldquo;I&rsquo;ve read this.&rdquo; High and Urgent alerts also send an email.
          </p>
        </div>
      )}

      <div>
        <label className="label">Subject</label>
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} autoFocus />
      </div>

      <div>
        <label className="label">Message</label>
        <textarea className="input" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>

      {kind === "ALERT" && (
        <div>
          <label className="label">Priority</label>
          <select className="input sm:max-w-[200px]" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {["Normal", "High", "Urgent"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="label">Recipients</label>
        <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
          <input type="checkbox" checked={toAll} onChange={(e) => setToAll(e.target.checked)} className="w-4 h-4 accent-[#4CAB3E]" />
          <span className="text-brand-ink font-semibold">Everyone on the team</span>
        </label>
        {!toAll && (
          <div className="grid sm:grid-cols-3 gap-1.5 border border-brand-line rounded-md p-3">
            {teamMembers.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  onChange={(e) =>
                    setSelected((prev) => (e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id)))
                  }
                  className="w-3.5 h-3.5 accent-[#4CAB3E]"
                />
                <span className="text-brand-inkSoft">{m.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {msg && <p className={`text-sm ${msg.type === "err" ? "text-red-600" : "text-brand-greenDark"}`}>{msg.text}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="btn-primary text-sm">
          {isPending ? "Sending…" : kind === "ALERT" ? "Push Alert" : "Send Message"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
