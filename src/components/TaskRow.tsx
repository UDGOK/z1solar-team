"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateTask, deleteTask } from "@/lib/actions";

export type TaskRowData = {
  id: string;
  text: string;
  done: boolean;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  projectId: string;
  projectTitle: string;
  createdByName: string | null;
};

function dueMeta(dueDate: string | null, done: boolean) {
  if (!dueDate) return { label: "No due date", tone: "faint" as const };
  const d = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  const short = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (done) return { label: short, tone: "faint" as const };
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: "bad" as const };
  if (days === 0) return { label: "Due today", tone: "warn" as const };
  if (days === 1) return { label: "Due tomorrow", tone: "warn" as const };
  if (days <= 7) return { label: `Due ${short}`, tone: "soon" as const };
  return { label: short, tone: "faint" as const };
}

const TONE: Record<string, string> = {
  bad: "text-red-600 font-bold",
  warn: "text-brand-amber font-semibold",
  soon: "text-brand-greenDark font-semibold",
  faint: "text-brand-inkFaint",
};

export default function TaskRow({
  task,
  teamMembers,
  canEdit,
  showProject = true,
}: {
  task: TaskRowData;
  teamMembers: { id: string; name: string }[];
  canEdit: boolean;
  showProject?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.text);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId || "");
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const due = dueMeta(task.dueDate, task.done);

  function toggle(done: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await updateTask(task.id, { done });
      } catch (e: any) {
        setError(e?.message || "Couldn't update.");
      }
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateTask(task.id, {
          text,
          assigneeId: assigneeId || null,
          dueDate: dueDate || null,
        });
        setEditing(false);
      } catch (e: any) {
        setError(e?.message || "Couldn't save.");
      }
    });
  }

  function remove() {
    if (!confirm(`Delete "${task.text.slice(0, 50)}"?`)) return;
    startTransition(async () => {
      try {
        await deleteTask(task.id);
      } catch (e: any) {
        setError(e?.message || "Couldn't delete.");
      }
    });
  }

  if (editing) {
    return (
      <div className="border border-brand-green rounded-md bg-white p-3 space-y-2">
        <input className="input text-sm" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        <div className="grid sm:grid-cols-2 gap-2">
          <div>
            <label className="label !text-[10px]">Assign to</label>
            <select className="input text-xs" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">— unassigned —</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label !text-[10px]">Due date</label>
            <input type="date" className="input text-xs" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={isPending} className="btn-primary text-xs">
            {isPending ? "Saving…" : "Save"}
          </button>
          <button onClick={() => { setEditing(false); setText(task.text); }} className="btn-secondary text-xs">
            Cancel
          </button>
          <button onClick={remove} disabled={isPending} className="btn-danger text-xs ml-auto">
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group border rounded-md bg-white p-3 ${task.done ? "border-brand-line opacity-70" : due.tone === "bad" ? "border-red-200" : "border-brand-line"}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={task.done}
          disabled={isPending}
          onChange={(e) => toggle(e.target.checked)}
          className="w-4 h-4 mt-0.5 accent-[#4CAB3E] shrink-0 cursor-pointer"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm leading-snug ${task.done ? "line-through text-brand-inkFaint" : "text-brand-ink"}`}>
            {task.text}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
            {task.assigneeName ? (
              <span className="px-1.5 py-0.5 rounded bg-brand-greenTint text-brand-greenDark font-semibold">
                {task.assigneeName}
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-brand-greenTint text-brand-inkFaint italic">
                unassigned
              </span>
            )}
            <span className={TONE[due.tone]}>{due.label}</span>
            {showProject && (
              <Link href={`/projects/${task.projectId}`} className="text-brand-inkFaint hover:text-brand-greenDark hover:underline">
                {task.projectTitle}
              </Link>
            )}
          </div>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 text-xs text-brand-inkFaint hover:text-brand-greenDark opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit task"
          >
            ✎ Edit
          </button>
        )}
      </div>
    </div>
  );
}
