"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { quickUpdateProject } from "@/lib/actions";

const STATUS: Record<string, { dot: string; border: string; bar: string; label: string }> = {
  "On Track": { dot: "#4CAB3E", border: "#B8DCB2", bar: "#4CAB3E", label: "ON TRACK" },
  Complete: { dot: "#3F9634", border: "#B8DCB2", bar: "#3F9634", label: "COMPLETE" },
  "At Risk": { dot: "#E8743B", border: "#F0D3B8", bar: "#E8743B", label: "AT RISK" },
  Delayed: { dot: "#C0392B", border: "#E8C4BC", bar: "#C0392B", label: "DELAYED" },
  Planning: { dot: "#D8D8D2", border: "#E5E3DB", bar: "#B4B2A9", label: "PLANNING" },
};

const PRIORITY: Record<string, { bg: string; fg: string }> = {
  High: { bg: "#FBEDEA", fg: "#A32D2D" },
  Medium: { bg: "#FAF3E8", fg: "#8B5A2B" },
  Low: { bg: "#F7F6F1", fg: "#5F5E5A" },
};

export type CardProject = {
  id: string;
  title: string;
  priority: string;
  status: string;
  completionPct: number;
  leadName: string | null;
  openTodos: number;
  overdueTodos: number;
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default function ProjectCard({ project, canEdit }: { project: CardProject; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(project.title);
  const [priority, setPriority] = useState(project.priority);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const s = STATUS[project.status] || STATUS.Planning;
  const p = PRIORITY[project.priority] || PRIORITY.Medium;
  const dormant = project.completionPct === 0 && project.status === "Planning";

  function save(nextPriority?: string) {
    const newTitle = title.trim();
    const newPriority = nextPriority ?? priority;
    if (!newTitle) {
      setError("Name can't be empty");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await quickUpdateProject(project.id, { title: newTitle, priority: newPriority });
        setEditing(false);
      } catch (e: any) {
        // Revert so the card never shows a value that wasn't actually saved.
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

  if (editing) {
    return (
      <div className="bg-white rounded-[5px] p-3 border border-brand-green" style={{ boxShadow: "0 0 0 3px rgba(76,171,62,.08)" }}>
        <p className="text-[8px] font-semibold tracking-[0.1em] text-brand-greenDark mb-1.5">EDITING</p>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          maxLength={120}
          className="w-full font-medium text-[13px] text-brand-ink border border-brand-green rounded px-2 py-1.5 mb-2 outline-none"
        />
        <div className="flex gap-1.5 mb-2">
          {["High", "Medium", "Low"].map((lvl) => {
            const on = priority === lvl;
            const c = PRIORITY[lvl];
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => setPriority(lvl)}
                className="flex-1 text-[9.5px] font-semibold py-1.5 rounded border transition-colors"
                style={
                  on
                    ? { background: c.fg, color: "#fff", borderColor: c.fg }
                    : { background: c.bg, color: c.fg, borderColor: "#E5E3DB" }
                }
              >
                {lvl.toUpperCase()}
              </button>
            );
          })}
        </div>
        {error && <p className="text-[10px] text-red-600 mb-1.5">{error}</p>}
        <div className="flex gap-1.5 items-center">
          <button onClick={() => save()} disabled={isPending} className="btn-primary !text-[10.5px] !px-3 !py-1.5">
            {isPending ? "Saving…" : "Save"}
          </button>
          <button onClick={cancel} className="text-[10.5px] text-brand-inkFaint px-2">Cancel</button>
          <span className="ml-auto text-[9px] text-brand-inkFaint">⏎ save · esc cancel</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group bg-white rounded-[5px] p-3 border border-dashed transition-opacity ${dormant ? "opacity-70" : ""}`}
      style={{ borderColor: s.border }}
    >
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <Link href={`/projects/${project.id}`} className="font-medium text-[13px] text-brand-ink leading-snug hover:text-brand-greenDark">
            {project.title}
          </Link>
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              aria-label={`Edit ${project.title}`}
              className="ml-1.5 text-brand-line hover:text-brand-greenDark opacity-0 group-hover:opacity-100 transition-opacity align-middle"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
              </svg>
            </button>
          )}
        </div>
        <span className="shrink-0 font-heading font-extrabold text-[18px] leading-none" style={{ color: dormant ? "#B4B2A9" : "#1C1C1C" }}>
          {project.completionPct}
          <span className="text-[9px] text-brand-inkFaint">%</span>
        </span>
      </div>

      <div className="h-[3px] bg-brand-greenTint rounded-sm overflow-hidden mb-2">
        <div className="h-full rounded-sm" style={{ width: `${Math.max(0, Math.min(100, project.completionPct))}%`, backgroundColor: s.bar }} />
      </div>

      <div className="flex items-center gap-1.5 pt-2 border-t border-brand-line/60">
        {project.leadName ? (
          <>
            <span className="w-[18px] h-[18px] rounded-full bg-brand-greenTint text-brand-greenDark text-[7px] font-semibold flex items-center justify-center shrink-0">
              {initials(project.leadName)}
            </span>
            <span className="text-[10.5px] text-brand-inkFaint truncate flex-1">{project.leadName}</span>
          </>
        ) : (
          <span className="text-[10.5px] text-brand-amber italic flex-1">Unassigned</span>
        )}
        {project.overdueTodos > 0 && (
          <span className="text-[9px] font-medium text-[#C0392B] shrink-0">{project.overdueTodos} overdue</span>
        )}
        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: p.bg, color: p.fg }}>
          {project.priority.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
