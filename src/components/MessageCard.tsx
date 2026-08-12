"use client";

import { useState, useTransition } from "react";
import { markMessageRead, replyToMessage, deleteMessageForMe, deleteMessageForEveryone } from "@/lib/actions";

export type MessageItem = {
  id: string;
  subject: string;
  body: string;
  kind: string;
  priority: string;
  senderName: string;
  senderId: string | null;
  createdAt: string;
  read: boolean;
  acknowledged: boolean;
  isMine: boolean;
  recipientCount: number;
  replies: { id: string; body: string; senderName: string; createdAt: string }[];
};

const PRIORITY_COLOR: Record<string, string> = {
  Urgent: "#C0392B",
  High: "#E8743B",
  Normal: "#4CAB3E",
};

function when(d: string) {
  const dt = new Date(d);
  const mins = Math.floor((Date.now() - dt.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MessageCard({ m, canDeleteForAll }: { m: MessageItem; canDeleteForAll: boolean }) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [showReply, setShowReply] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function expand() {
    setOpen(!open);
    if (!open && !m.read && !m.isMine) startTransition(() => markMessageRead(m.id));
  }

  function send() {
    if (!reply.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await replyToMessage(m.id, reply);
        setReply("");
        setShowReply(false);
      } catch (e: any) {
        setError(e?.message || "Couldn't send reply.");
      }
    });
  }

  function removeMine() {
    if (!confirm("Remove this from your inbox? Others keep their copy.")) return;
    startTransition(async () => {
      await deleteMessageForMe(m.id);
    });
  }

  function removeAll() {
    if (!confirm("Delete this message for everyone? This can't be undone.")) return;
    startTransition(async () => {
      try {
        await deleteMessageForEveryone(m.id);
      } catch (e: any) {
        setError(e?.message || "Couldn't delete.");
      }
    });
  }

  const isAlert = m.kind === "ALERT";
  const color = PRIORITY_COLOR[m.priority] || PRIORITY_COLOR.Normal;

  return (
    <div className={`border rounded-md bg-white overflow-hidden ${!m.read && !m.isMine ? "border-brand-green" : "border-brand-line"}`}>
      <button onClick={expand} className="w-full text-left px-4 py-3 hover:bg-brand-greenTint transition-colors">
        <div className="flex items-start gap-2">
          {!m.read && !m.isMine && <span className="mt-1.5 w-2 h-2 rounded-full bg-brand-green shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {isAlert && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white" style={{ backgroundColor: color }}>
                  {m.priority.toUpperCase()} ALERT
                </span>
              )}
              <span className={`text-sm ${!m.read && !m.isMine ? "font-bold text-brand-ink" : "font-semibold text-brand-inkSoft"}`}>
                {m.subject}
              </span>
            </div>
            <p className="text-[11px] text-brand-inkFaint mt-0.5">
              {m.isMine ? `You → ${m.recipientCount} recipient${m.recipientCount === 1 ? "" : "s"}` : m.senderName} ·{" "}
              {when(m.createdAt)}
              {m.replies.length > 0 && ` · ${m.replies.length} repl${m.replies.length === 1 ? "y" : "ies"}`}
            </p>
          </div>
          <span className="text-brand-inkFaint text-xs shrink-0">{open ? "▾" : "▸"}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-brand-line pt-3">
          <p className="text-sm text-brand-inkSoft whitespace-pre-wrap leading-relaxed">{m.body}</p>

          {m.replies.length > 0 && (
            <div className="mt-4 space-y-2 border-l-2 border-brand-line pl-3">
              {m.replies.map((r) => (
                <div key={r.id}>
                  <p className="text-[11px] font-semibold text-brand-greenDark">
                    {r.senderName} · {when(r.createdAt)}
                  </p>
                  <p className="text-sm text-brand-inkSoft whitespace-pre-wrap">{r.body}</p>
                </div>
              ))}
            </div>
          )}

          {showReply && (
            <div className="mt-3">
              <textarea
                className="input text-sm"
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button onClick={send} disabled={isPending} className="btn-primary text-xs">
                  {isPending ? "Sending…" : "Send Reply"}
                </button>
                <button onClick={() => setShowReply(false)} className="btn-secondary text-xs">Cancel</button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

          {!showReply && (
            <div className="flex gap-2 mt-3 flex-wrap">
              <button onClick={() => setShowReply(true)} className="btn-secondary text-xs">↩ Reply</button>
              {!m.isMine && (
                <button onClick={removeMine} disabled={isPending} className="btn-secondary text-xs">
                  Remove from my inbox
                </button>
              )}
              {(m.isMine || canDeleteForAll) && (
                <button onClick={removeAll} disabled={isPending} className="btn-danger text-xs">
                  Delete for everyone
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
