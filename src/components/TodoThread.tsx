"use client";

import { useState, useTransition } from "react";
import { formatInstantDate, formatDate } from "@/lib/time";
import { addTodoComment, markTodoDone, confirmTodo } from "@/lib/actions";

export type ThreadComment = {
  id: string; authorName: string; body: string; kind: string; createdAt: string;
};
export type ThreadTask = {
  id: string;
  text: string;
  done: boolean;
  requiresConfirmation: boolean;
  completedByName: string | null;
  completedAt: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  reopenedAt: string | null;
  dueDate: string | null;
  assigneeNames: string[];
  projectTitle: string;
  comments: ThreadComment[];
};

const KIND_STYLE: Record<string, { color: string; label: string }> = {
  COMPLETED: { color: "#4CAB3E", label: "marked done" },
  CONFIRMED: { color: "#3F9634", label: "confirmed" },
  REOPENED: { color: "#C0392B", label: "reopened" },
};

function when(iso: string) {
  const d = new Date(iso);
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return formatInstantDate(d);
}

export default function TodoThread({
  task, currentMemberId, canConfirm, isAssignee,
}: {
  task: ThreadTask;
  currentMemberId: string;
  canConfirm: boolean;
  isAssignee: boolean;
}) {
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function act(fn: () => Promise<any>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try { await fn(); after?.(); }
      catch (e: any) { setError(e?.message || "Something went wrong."); }
    });
  }

  const awaitingConfirm = task.done && task.requiresConfirmation && !task.confirmedAt;

  return (
    <div className="bg-white border border-brand-line rounded-md p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${task.confirmedAt ? "text-brand-inkFaint line-through" : "text-brand-ink"}`}>
            {task.text}
          </p>
          <p className="text-[11px] text-brand-inkFaint mt-0.5">
            {task.projectTitle}
            {task.assigneeNames.length > 0 && <> · {task.assigneeNames.join(", ")}</>}
            {/* dueDate came from a date picker — a calendar date, formatted in UTC. */}
            {task.dueDate && <> · due {formatDate(task.dueDate, { year: undefined })}</>}
          </p>
        </div>
        <div className="shrink-0">
          {task.confirmedAt ? (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-white bg-brand-greenDark">CONFIRMED</span>
          ) : awaitingConfirm ? (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-white bg-brand-amber">AWAITING CONFIRMATION</span>
          ) : task.reopenedAt ? (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: "#C0392B" }}>REOPENED</span>
          ) : (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-brand-greenTint text-brand-inkSoft">OPEN</span>
          )}
        </div>
      </div>

      {task.comments.length > 0 && (
        <div className="space-y-2 border-l-2 border-brand-line pl-3 my-3">
          {task.comments.map((c) => {
            const k = KIND_STYLE[c.kind];
            return (
              <div key={c.id}>
                <p className="text-[11px]">
                  <span className="font-semibold text-brand-ink">{c.authorName}</span>
                  {k && <span className="ml-1.5 font-semibold" style={{ color: k.color }}>{k.label}</span>}
                  <span className="text-brand-inkFaint ml-1.5">{when(c.createdAt)}</span>
                </p>
                <p className="text-[13px] text-brand-inkSoft whitespace-pre-wrap">{c.body}</p>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {!task.done && isAssignee && (
        <div className="flex gap-2 items-center flex-wrap mb-2">
          <input
            className="input !py-1 text-xs flex-1 min-w-[160px]"
            placeholder="Optional note on what you did…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button onClick={() => act(() => markTodoDone(task.id, note), () => setNote(""))} disabled={isPending} className="btn-primary !text-[11px] !px-3 !py-1.5">
            Mark done
          </button>
        </div>
      )}

      {awaitingConfirm && canConfirm && (
        <div className="rounded bg-orange-50 border border-orange-200 p-2.5 mb-2">
          <p className="text-[11px] text-brand-amber font-semibold mb-1.5">
            {task.completedByName} marked this done{task.completedAt && <> {when(task.completedAt)}</>} — confirm or send it back.
          </p>
          <div className="flex gap-2 items-center flex-wrap">
            <input className="input !py-1 text-xs flex-1 min-w-[140px]" placeholder="Optional note…" value={note} onChange={(e) => setNote(e.target.value)} />
            <button onClick={() => act(() => confirmTodo(task.id, true, note), () => setNote(""))} disabled={isPending} className="btn-primary !text-[11px] !px-3 !py-1.5">
              Confirm
            </button>
            <button onClick={() => act(() => confirmTodo(task.id, false, note), () => setNote(""))} disabled={isPending} className="btn-danger !text-[11px] !px-3 !py-1.5">
              Not done
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 items-center">
        <input
          className="input !py-1 text-xs flex-1"
          placeholder="Reply…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && body.trim()) act(() => addTodoComment(task.id, body), () => setBody("")); }}
        />
        <button
          onClick={() => act(() => addTodoComment(task.id, body), () => setBody(""))}
          disabled={isPending || !body.trim()}
          className="btn-secondary !text-[11px] !px-3 !py-1.5"
        >
          Send
        </button>
      </div>
    </div>
  );
}
