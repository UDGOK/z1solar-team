"use client";

import { useState, useTransition } from "react";
import { acknowledgeAlert } from "@/lib/actions";

type Alert = {
  id: string;
  subject: string;
  body: string;
  priority: string;
  senderName: string;
  createdAt: string;
};

const PRIORITY: Record<string, { color: string; label: string }> = {
  Urgent: { color: "#C0392B", label: "URGENT" },
  High: { color: "#E8743B", label: "HIGH PRIORITY" },
  Normal: { color: "#4CAB3E", label: "ALERT" },
};

export default function AlertPopup({ alerts }: { alerts: Alert[] }) {
  const [queue, setQueue] = useState(alerts);
  const [isPending, startTransition] = useTransition();

  if (queue.length === 0) return null;

  const current = queue[0];
  const p = PRIORITY[current.priority] || PRIORITY.Normal;

  function acknowledge() {
    const id = current.id;
    startTransition(async () => {
      await acknowledgeAlert(id);
      // Show the next one in the stack rather than dismissing everything.
      setQueue((q) => q.slice(1));
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-lg shadow-2xl overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: p.color }}>
          <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-white">{p.label}</span>
          {queue.length > 1 && (
            <span className="font-mono text-[11px] text-white/90">1 of {queue.length}</span>
          )}
        </div>

        <div className="p-6">
          <h2 className="font-heading text-xl font-extrabold text-brand-ink mb-1">{current.subject}</h2>
          <p className="text-xs text-brand-inkFaint mb-4">
            From {current.senderName} ·{" "}
            {new Date(current.createdAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
          <div className="max-h-64 overflow-auto">
            <p className="text-sm text-brand-inkSoft whitespace-pre-wrap leading-relaxed">{current.body}</p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-brand-line bg-brand-greenTint flex items-center justify-between gap-3">
          <p className="text-[11px] text-brand-inkFaint">
            You must acknowledge this alert to continue.
          </p>
          <button onClick={acknowledge} disabled={isPending} className="btn-primary text-sm shrink-0">
            {isPending ? "…" : "I've read this"}
          </button>
        </div>
      </div>
    </div>
  );
}
