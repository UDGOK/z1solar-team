"use client";

import { useState, useTransition } from "react";
import { createTask } from "@/lib/actions";

type Option = { id: string; name?: string; title?: string };

export default function NewTaskForm({
  projects,
  teamMembers,
  defaultProjectId,
}: {
  projects: { id: string; title: string }[];
  teamMembers: { id: string; name: string }[];
  defaultProjectId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState(defaultProjectId || projects[0]?.id || "");
  const [text, setText] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!text.trim()) {
      setError("Enter a task description.");
      return;
    }
    startTransition(async () => {
      try {
        await createTask({ projectId, text, assigneeId: assigneeId || null, dueDate: dueDate || null });
        setText("");
        setAssigneeId("");
        setDueDate("");
        setOpen(false);
      } catch (err: any) {
        setError(err?.message || "Couldn't create the task.");
      }
    });
  }

  if (projects.length === 0) {
    return (
      <p className="text-xs text-brand-inkFaint italic">
        You don&rsquo;t have edit access to any project yet, so you can&rsquo;t create tasks.
      </p>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary text-xs">
        + New Task
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card p-4 bg-white space-y-3">
      <p className="kicker">New Task</p>
      <div>
        <label className="label">Task</label>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What needs doing?"
          autoFocus
        />
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Project</label>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Assign to</label>
          <select className="input" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">— unassigned —</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Due date</label>
          <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <p className="text-[11px] text-brand-inkFaint">
        Anyone on the team can be assigned — they don&rsquo;t need access to the rest of the project.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="btn-primary text-xs">
          {isPending ? "Creating…" : "Create Task"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-xs">
          Cancel
        </button>
      </div>
    </form>
  );
}
