"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { quickUpdateProject, deleteProjectFromList } from "@/lib/actions";

const STATUS_COLOR: Record<string, string> = {
  Planning: "#8A8A85",
  "On Track": "#4CAB3E",
  "At Risk": "#E8743B",
  Delayed: "#C0392B",
  Complete: "#3F9634",
};

const PRIORITY: Record<string, { bg: string; fg: string }> = {
  High: { bg: "#FBEDEA", fg: "#A32D2D" },
  Medium: { bg: "#FAF3E8", fg: "#8B5A2B" },
  Low: { bg: "#F7F6F1", fg: "#5F5E5A" },
};

export type ProjectRowData = {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  leadName: string | null;
  budget: string;
  openTodos: number;
};

export default function ProjectRow({
  project,
  zebra,
  canEdit,
  canDelete,
  showBudget,
}: {
  project: ProjectRowData;
  zebra: boolean;
  canEdit: boolean;
  canDelete: boolean;
  showBudget: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(project.title);
  const [priority, setPriority] = useState(project.priority);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  function save() {
    const t = title.trim();
    if (!t) {
      setError("Name required");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await quickUpdateProject(project.id, { title: t, priority });
        setEditing(false);
      } catch (e: any) {
        setTitle(project.title);
        setPriority(project.priority);
        setError(e?.message || "Couldn't save");
      }
    });
  }

  function cancel() {
    setTitle(project.title);
    setPriority(project.priority);
    setError(null);
    setEditing(false);
  }

  function remove() {
    // Deliberately requires typing nothing but a confirm — deleting a project
    // cascades to its tasks, files, financials and history.
    if (!confirm(`Delete "${project.title}"?\n\nThis also removes its tasks, files, financial records and history. This can't be undone.`)) return;
    startTransition(async () => {
      try {
        await deleteProjectFromList(project.id);
      } catch (e: any) {
        setError(e?.message || "Couldn't delete");
      }
    });
  }

  const p = PRIORITY[project.priority] || PRIORITY.Medium;
  const cols = showBudget ? 7 : 6;

  if (editing) {
    return (
      <tr className="border-t border-brand-line bg-brand-greenTint/40">
        <td colSpan={cols} className="px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={ref}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") cancel();
              }}
              maxLength={120}
              className="input !py-1 !px-2 text-sm flex-1 min-w-[200px]"
            />
            <div className="flex gap-1">
              {["High", "Medium", "Low"].map((lvl) => {
                const on = priority === lvl;
                const c = PRIORITY[lvl];
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setPriority(lvl)}
                    className="text-[10px] font-semibold px-2.5 py-1 rounded border"
                    style={on ? { background: c.fg, color: "#fff", borderColor: c.fg } : { background: c.bg, color: c.fg, borderColor: "#E5E3DB" }}
                  >
                    {lvl.toUpperCase()}
                  </button>
                );
              })}
            </div>
            <button onClick={save} disabled={isPending} className="btn-primary !text-[11px] !px-3 !py-1">
              {isPending ? "Saving…" : "Save"}
            </button>
            <button onClick={cancel} className="text-[11px] text-brand-inkFaint px-2">Cancel</button>
            {error && <span className="text-[11px] text-red-600">{error}</span>}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`group border-t border-brand-line ${zebra ? "bg-brand-greenTint/40" : ""} hover:bg-green-50/60`}>
      <td className="px-4 py-2.5">
        <Link href={`/projects/${project.id}`} className="font-semibold text-brand-ink hover:text-brand-greenDark">
          {project.title}
        </Link>
        {error && <span className="ml-2 text-[11px] text-red-600">{error}</span>}
      </td>
      <td className="px-4 py-2.5 text-brand-inkSoft">{project.category}</td>
      <td className="px-4 py-2.5">
        {project.leadName ? (
          <span className="text-brand-greenDark font-semibold">{project.leadName}</span>
        ) : (
          <span className="text-brand-amber italic">Unassigned</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-brand-inkSoft">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[project.status] || "#8A8A85" }} />
          {project.status}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: p.bg, color: p.fg }}>
          {project.priority.toUpperCase()}
        </span>
      </td>
      {showBudget && <td className="px-4 py-2.5 text-right">{project.budget}</td>}
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        <span className="font-mono text-brand-inkFaint mr-3">{project.openTodos}</span>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-brand-inkFaint hover:text-brand-greenDark opacity-0 group-hover:opacity-100 transition-opacity mr-2"
          >
            Rename
          </button>
        )}
        {canDelete && (
          <button
            onClick={remove}
            disabled={isPending}
            className="text-[11px] text-brand-inkFaint hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}
