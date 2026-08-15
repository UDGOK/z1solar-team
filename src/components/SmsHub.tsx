"use client";

import { useState, useTransition } from "react";
import { saveSmsContact, deleteSmsContact, sendProjectSms, assignSmsToProject } from "@/lib/actions";

export type SmsMsg = {
  id: string;
  direction: string;
  fromNumber: string;
  toNumber: string;
  body: string;
  status: string;
  routedBy: string | null;
  mediaCount: number;
  handled: boolean;
  projectId: string | null;
  projectTitle: string | null;
  senderName: string | null;
  createdAt: string;
};
export type SmsContactItem = {
  id: string; phone: string; name: string; company: string | null;
  active: boolean; optedOut: boolean; projectCount: number;
};

function fmtPhone(e: string) {
  const m = e.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e;
}
function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SmsHub({
  messages, contacts, projects, canSend, canManageContacts, configured,
}: {
  messages: SmsMsg[];
  contacts: SmsContactItem[];
  projects: { id: string; title: string }[];
  canSend: boolean;
  canManageContacts: boolean;
  configured: boolean;
}) {
  const [tab, setTab] = useState<"inbox" | "unfiled" | "contacts">("inbox");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [compose, setCompose] = useState(false);
  const [c, setC] = useState({ to: "", body: "", projectId: "" });
  const [addContact, setAddContact] = useState(false);
  const [nc, setNc] = useState({ phone: "", name: "", company: "", notes: "", active: true });

  const unfiled = messages.filter((m) => m.direction === "IN" && !m.projectId);

  function act(fn: () => Promise<any>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try { await fn(); after?.(); }
      catch (e: any) { setError(e?.message || "Something went wrong."); }
    });
  }

  return (
    <div className="space-y-5">
      {!configured && (
        <div className="rounded-md bg-orange-50 border border-orange-200 p-4">
          <p className="text-sm font-semibold text-brand-amber">Twilio isn&rsquo;t connected yet</p>
          <p className="text-xs text-brand-inkSoft mt-1">
            Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER and TWILIO_WEBHOOK_URL in Vercel,
            then point your Twilio number&rsquo;s incoming webhook at <code>/api/sms/webhook</code>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Messages" value={messages.length} />
        <Stat label="Unfiled" value={unfiled.length} tone={unfiled.length ? "bad" : "ok"} />
        <Stat label="Approved numbers" value={contacts.filter((x) => x.active).length} />
        <Stat label="Opted out" value={contacts.filter((x) => x.optedOut).length} />
      </div>

      {canSend && !compose && (
        <button onClick={() => setCompose(true)} className="btn-primary text-sm">+ Send a text</button>
      )}

      {compose && (
        <div className="card p-5 bg-white space-y-3">
          <p className="kicker">New message</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">To</label>
              <input className="input" value={c.to} onChange={(e) => setC({ ...c, to: e.target.value })} placeholder="(918) 555-0142" />
            </div>
            <div>
              <label className="label">Project (optional)</label>
              <select className="input" value={c.projectId} onChange={(e) => setC({ ...c, projectId: e.target.value })}>
                <option value="">— none —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Message</label>
            <textarea className="input" rows={3} value={c.body} onChange={(e) => setC({ ...c, body: e.target.value })} maxLength={1500} />
            <p className="text-[10px] text-brand-inkFaint mt-1">{c.body.length} characters · about {Math.max(1, Math.ceil(c.body.length / 160))} segment(s)</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => act(() => sendProjectSms({ to: c.to, body: c.body, projectId: c.projectId || null }), () => { setC({ to: "", body: "", projectId: "" }); setCompose(false); })}
              disabled={isPending}
              className="btn-primary text-sm"
            >
              {isPending ? "Sending…" : "Send"}
            </button>
            <button onClick={() => setCompose(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-1 border-b border-brand-line overflow-x-auto">
        {[
          { k: "inbox" as const, l: "All messages", n: messages.length },
          { k: "unfiled" as const, l: "Needs filing", n: unfiled.length },
          { k: "contacts" as const, l: "Approved numbers", n: contacts.length },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.k ? "border-brand-green text-brand-ink" : "border-transparent text-brand-inkFaint hover:text-brand-inkSoft"}`}>
            {t.l}
            {t.n > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-brand-greenTint text-brand-greenDark text-[10px] font-bold">{t.n}</span>}
          </button>
        ))}
      </div>

      {tab === "contacts" ? (
        <div className="space-y-3">
          {canManageContacts && !addContact && (
            <button onClick={() => setAddContact(true)} className="btn-secondary text-xs">+ Approve a number</button>
          )}
          {addContact && (
            <div className="card p-4 bg-white space-y-3">
              <p className="text-xs text-brand-inkFaint">
                Only approved numbers can text in. Anything else is rejected automatically.
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                <div><label className="label">Phone</label><input className="input" value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} placeholder="(918) 555-0142" /></div>
                <div><label className="label">Name</label><input className="input" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></div>
                <div><label className="label">Company</label><input className="input" value={nc.company} onChange={(e) => setNc({ ...nc, company: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => act(() => saveSmsContact(null, nc), () => { setNc({ phone: "", name: "", company: "", notes: "", active: true }); setAddContact(false); })}
                  disabled={isPending} className="btn-primary text-xs">{isPending ? "Saving…" : "Approve"}</button>
                <button onClick={() => setAddContact(false)} className="btn-secondary text-xs">Cancel</button>
              </div>
            </div>
          )}
          <div className="bg-white border border-brand-line rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-brand-ink text-white text-left">
                <th className="px-4 py-2.5 font-mono text-[10px] tracking-widest">NAME</th>
                <th className="px-4 py-2.5 font-mono text-[10px] tracking-widest">PHONE</th>
                <th className="px-4 py-2.5 font-mono text-[10px] tracking-widest">COMPANY</th>
                <th className="px-4 py-2.5 font-mono text-[10px] tracking-widest">STATUS</th>
                <th className="px-4 py-2.5"></th>
              </tr></thead>
              <tbody>
                {contacts.map((x, i) => (
                  <tr key={x.id} className={`border-t border-brand-line ${i % 2 ? "bg-brand-greenTint/40" : ""}`}>
                    <td className="px-4 py-2.5 font-semibold text-brand-ink">{x.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{fmtPhone(x.phone)}</td>
                    <td className="px-4 py-2.5 text-brand-inkSoft">{x.company || "—"}</td>
                    <td className="px-4 py-2.5">
                      {x.optedOut ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-700">OPTED OUT</span>
                        : x.active ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-greenTint text-brand-greenDark">ACTIVE</span>
                        : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-greenTint text-brand-inkFaint">INACTIVE</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {canManageContacts && (
                        <button onClick={() => { if (confirm(`Remove ${x.name}? They won't be able to text in.`)) act(() => deleteSmsContact(x.id)); }}
                          className="text-[11px] text-brand-inkFaint hover:text-red-600">Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
                {contacts.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-brand-inkFaint text-sm">
                    No outside numbers approved yet. Team members with a phone number on file can already text in.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {(tab === "unfiled" ? unfiled : messages).map((m) => (
            <div key={m.id} className={`bg-white border rounded-md p-3 ${!m.projectId && m.direction === "IN" ? "border-brand-amber" : "border-brand-line"}`}
              style={m.direction === "OUT" ? { borderLeft: "3px solid #4CAB3E" } : {}}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-white ${m.direction === "IN" ? "bg-brand-inkFaint" : "bg-brand-green"}`}>
                      {m.direction === "IN" ? "IN" : "OUT"}
                    </span>
                    <span className="text-sm font-semibold text-brand-ink">{m.senderName || fmtPhone(m.direction === "IN" ? m.fromNumber : m.toNumber)}</span>
                    {m.projectTitle && <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-greenTint text-brand-greenDark">{m.projectTitle}</span>}
                    {m.routedBy && m.routedBy !== "outbound" && <span className="text-[9px] text-brand-inkFaint">via {m.routedBy}</span>}
                    {m.mediaCount > 0 && <span className="text-[10px] text-brand-inkFaint">📎 {m.mediaCount}</span>}
                    {m.status === "failed" && <span className="text-[9px] font-semibold text-red-600">FAILED</span>}
                  </div>
                  <p className="text-sm text-brand-inkSoft whitespace-pre-wrap">{m.body}</p>
                </div>
                <span className="text-[10px] text-brand-inkFaint shrink-0">{when(m.createdAt)}</span>
              </div>
              {!m.projectId && m.direction === "IN" && (
                <div className="mt-2 pt-2 border-t border-brand-line flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-brand-amber font-semibold">Not filed</span>
                  <select className="input !py-1 text-[11px] !w-auto" defaultValue=""
                    onChange={(e) => { if (e.target.value) act(() => assignSmsToProject(m.id, e.target.value)); }}>
                    <option value="">File to project…</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
          {(tab === "unfiled" ? unfiled : messages).length === 0 && (
            <div className="card p-10 text-center bg-white">
              <p className="text-sm text-brand-inkSoft">
                {tab === "unfiled" ? "Everything is filed." : "No messages yet."}
              </p>
            </div>
          )}
        </div>
      )}
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
