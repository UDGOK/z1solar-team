"use client";

import { useState, useMemo, useTransition } from "react";
import TaskRow, { type TaskRowData } from "./TaskRow";
import NewTaskForm from "./NewTaskForm";
import { bulkUpdateTasks, saveView, deleteSavedView } from "@/lib/actions";

export type SavedViewItem = { id: string; name: string; filters: string; shared: boolean; isMine: boolean };

type View = "mine" | "assigned" | "everyone" | "workload";

export default function TasksHub({
  tasks,
  teamMembers,
  editableProjects,
  currentMemberId,
  canEditProjectIds,
  isAdmin,
  savedViews,
}: {
  tasks: TaskRowData[];
  teamMembers: { id: string; name: string }[];
  editableProjects: { id: string; title: string }[];
  currentMemberId: string;
  canEditProjectIds: string[];
  isAdmin: boolean;
  savedViews: SavedViewItem[];
}) {
  const [view, setView] = useState<View>("mine");
  const [showDone, setShowDone] = useState(false);
  const [filterProject, setFilterProject] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, startBulk] = useTransition();
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [savingView, setSavingView] = useState(false);
  const [viewName, setViewName] = useState("");
  const [shareView, setShareView] = useState(false);

  const editable = useMemo(() => new Set(canEditProjectIds), [canEditProjectIds]);

  const mine = tasks.filter((t) => t.assigneeIds.includes(currentMemberId));
  const assignedByMe = tasks.filter((t) => !t.assigneeIds.includes(currentMemberId));

  const base = view === "mine" ? mine : view === "assigned" ? assignedByMe : tasks;

  const filtered = useMemo(() => {
    return base
      .filter((t) => (showDone ? true : !t.done))
      .filter((t) => (filterProject ? t.projectId === filterProject : true))
      .filter((t) =>
        filterAssignee
          ? filterAssignee === "__none"
            ? t.assigneeIds.length === 0
            : t.assigneeIds.includes(filterAssignee)
          : true
      )
      .filter((t) => {
        if (!onlyOverdue) return true;
        const d0 = new Date();
        d0.setHours(0, 0, 0, 0);
        return !t.done && !!t.dueDate && new Date(t.dueDate) < d0;
      });
  }, [base, showDone, filterProject, filterAssignee, onlyOverdue]);

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const isOverdue = (t: TaskRowData) => !t.done && t.dueDate && new Date(t.dueDate) < now;

  const stats = {
    mineOpen: mine.filter((t) => !t.done).length,
    mineOverdue: mine.filter(isOverdue).length,
    allOpen: tasks.filter((t) => !t.done).length,
    allOverdue: tasks.filter(isOverdue).length,
    unassigned: tasks.filter((t) => !t.done && t.assigneeIds.length === 0).length,
  };

  // Workload view — who's carrying what.
  const workload = useMemo(() => {
    const map = new Map<string, { name: string; open: number; overdue: number; done: number }>();
    for (const m of teamMembers) map.set(m.id, { name: m.name, open: 0, overdue: 0, done: 0 });
    map.set("__none", { name: "Unassigned", open: 0, overdue: 0, done: 0 });
    for (const t of tasks) {
      // A task with several assignees counts toward each of their workloads.
      const keys = t.assigneeIds.length ? t.assigneeIds : ["__none"];
      for (const key of keys) {
        const row = map.get(key);
        if (!row) continue;
        if (t.done) row.done++;
        else {
          row.open++;
          if (isOverdue(t)) row.overdue++;
        }
      }
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .filter((r) => r.open > 0 || r.done > 0)
      .sort((a, b) => b.open - a.open);
  }, [tasks, teamMembers]);

  const maxLoad = Math.max(...workload.map((w) => w.open), 1);

  const projectsInView = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks) seen.set(t.projectId, t.projectTitle);
    return Array.from(seen.entries()).map(([id, title]) => ({ id, title }));
  }, [tasks]);

  const currentFilters = { view, showDone, filterProject, filterAssignee, onlyOverdue };

  function applyView(v: SavedViewItem) {
    try {
      const f = JSON.parse(v.filters);
      if (f.view) setView(f.view);
      setShowDone(!!f.showDone);
      setFilterProject(f.filterProject || "");
      setFilterAssignee(f.filterAssignee || "");
      setOnlyOverdue(!!f.onlyOverdue);
      setSelected(new Set());
    } catch {
      /* a malformed saved view shouldn't break the page */
    }
  }

  function persistView() {
    if (!viewName.trim()) return;
    startBulk(async () => {
      await saveView(viewName.trim(), "tasks", currentFilters, shareView);
      setViewName("");
      setShareView(false);
      setSavingView(false);
    });
  }

  function toggleSel(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((t) => t.id))));
  }

  function runBulk(action: Parameters<typeof bulkUpdateTasks>[1]) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (action.type === "delete" && !confirm(`Delete ${ids.length} task${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    setBulkMsg(null);
    startBulk(async () => {
      const res = await bulkUpdateTasks(ids, action);
      setSelected(new Set());
      setBulkMsg(
        res.skipped > 0
          ? `Updated ${res.updated}. Skipped ${res.skipped} you don't have permission to edit.`
          : `Updated ${res.updated} task${res.updated === 1 ? "" : "s"}.`
      );
      setTimeout(() => setBulkMsg(null), 4000);
    });
  }

  const TABS: { key: View; label: string; count?: number }[] = [
    { key: "mine", label: "My Tasks", count: stats.mineOpen },
    { key: "assigned", label: "Assigned to Others", count: assignedByMe.filter((t) => !t.done).length },
    { key: "everyone", label: "All Tasks", count: stats.allOpen },
    { key: "workload", label: "Workload" },
  ];

  return (
    <div className="space-y-5">
      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="My open tasks" value={stats.mineOpen} />
        <Stat label="My overdue" value={stats.mineOverdue} tone={stats.mineOverdue ? "bad" : "ok"} />
        <Stat label="Team open" value={stats.allOpen} />
        <Stat label="Unassigned" value={stats.unassigned} tone={stats.unassigned ? "warn" : "ok"} />
      </div>

      <NewTaskForm projects={editableProjects} teamMembers={teamMembers} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-brand-line overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              view === t.key
                ? "border-brand-green text-brand-ink"
                : "border-transparent text-brand-inkFaint hover:text-brand-inkSoft"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-brand-greenTint text-brand-greenDark text-[10px] font-bold">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {view === "workload" ? (
        <div className="card bg-white p-5">
          <p className="kicker mb-3">Who&rsquo;s Carrying What</p>
          <div className="space-y-2.5">
            {workload.map((w) => (
              <div key={w.id} className="flex items-center gap-3">
                <span className={`w-32 shrink-0 text-sm truncate ${w.id === "__none" ? "italic text-brand-inkFaint" : "text-brand-ink font-semibold"}`}>
                  {w.name}
                </span>
                <div className="flex-1 h-5 bg-brand-greenTint rounded overflow-hidden flex">
                  <div className="h-full bg-red-500" style={{ width: `${(w.overdue / maxLoad) * 100}%` }} title={`${w.overdue} overdue`} />
                  <div className="h-full bg-brand-green" style={{ width: `${((w.open - w.overdue) / maxLoad) * 100}%` }} title={`${w.open - w.overdue} on track`} />
                </div>
                <span className="w-28 shrink-0 text-right text-xs">
                  <span className="font-bold text-brand-ink">{w.open}</span>
                  <span className="text-brand-inkFaint"> open</span>
                  {w.overdue > 0 && <span className="text-red-600 font-bold"> · {w.overdue} late</span>}
                </span>
              </div>
            ))}
            {workload.length === 0 && <p className="text-sm text-brand-inkFaint">No tasks yet.</p>}
          </div>
          <p className="text-[10px] text-brand-inkFaint mt-3">Red = overdue · Green = on track</p>
        </div>
      ) : (
        <>
          {/* Saved views */}
          {(savedViews.length > 0 || true) && (
            <div className="flex gap-2 flex-wrap items-center">
              {savedViews.map((v) => (
                <span key={v.id} className="inline-flex items-center rounded-md border border-brand-line bg-white overflow-hidden">
                  <button onClick={() => applyView(v)} className="px-2.5 py-1 text-xs font-semibold text-brand-inkSoft hover:bg-brand-greenTint">
                    {v.shared && <span title="Shared with team">👥 </span>}
                    {v.name}
                  </button>
                  {(v.isMine || isAdmin) && (
                    <button
                      onClick={() => startBulk(async () => { await deleteSavedView(v.id); })}
                      className="px-1.5 py-1 text-xs text-brand-inkFaint hover:text-red-600 border-l border-brand-line"
                      title="Delete view"
                    >×</button>
                  )}
                </span>
              ))}
              {savingView ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    className="input !py-1 !px-2 text-xs !w-40"
                    placeholder="View name"
                    value={viewName}
                    onChange={(e) => setViewName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && persistView()}
                  />
                  {isAdmin && (
                    <label className="flex items-center gap-1 text-[11px] text-brand-inkSoft cursor-pointer">
                      <input type="checkbox" checked={shareView} onChange={(e) => setShareView(e.target.checked)} className="w-3 h-3 accent-[#4CAB3E]" />
                      share
                    </label>
                  )}
                  <button onClick={persistView} className="btn-primary !px-2 !py-1 text-[11px]">Save</button>
                  <button onClick={() => setSavingView(false)} className="btn-secondary !px-2 !py-1 text-[11px]">×</button>
                </span>
              ) : (
                <button onClick={() => setSavingView(true)} className="text-xs font-semibold text-brand-greenDark hover:underline">
                  + Save current view
                </button>
              )}
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 flex-wrap items-center">
            <select className="input !py-1.5 text-xs !w-auto" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
              <option value="">All projects</option>
              {projectsInView.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            {view !== "mine" && (
              <select className="input !py-1.5 text-xs !w-auto" value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
                <option value="">Anyone</option>
                <option value="__none">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-1.5 text-xs cursor-pointer text-brand-inkSoft">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="w-3.5 h-3.5 accent-[#4CAB3E]" />
              Show completed
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer text-brand-inkSoft">
              <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} className="w-3.5 h-3.5 accent-[#C0392B]" />
              Overdue only
            </label>
            <span className="text-xs text-brand-inkFaint ml-auto">{filtered.length} shown</span>
          </div>

          {filtered.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer text-brand-inkSoft">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={selectAllVisible}
                  className="w-3.5 h-3.5 accent-[#4CAB3E]"
                />
                Select all
              </label>
              {selected.size > 0 && (
                <>
                  <span className="text-xs font-semibold text-brand-ink">{selected.size} selected</span>
                  <select
                    className="input !py-1 text-xs !w-auto"
                    defaultValue=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      if (v === "__none") runBulk({ type: "assign", assigneeIds: [], mode: "replace" });
                      else runBulk({ type: "assign", assigneeIds: [v], mode: "add" });
                      e.target.value = "";
                    }}
                  >
                    <option value="">Add assignee…</option>
                    <option value="__none">Clear all assignees</option>
                    {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <input
                    type="date"
                    className="input !py-1 text-xs !w-auto"
                    onChange={(e) => e.target.value && runBulk({ type: "due", dueDate: e.target.value })}
                    title="Set due date for selected"
                  />
                  <button onClick={() => runBulk({ type: "complete", done: true })} disabled={bulkBusy} className="btn-secondary !px-2 !py-1 text-xs">Mark done</button>
                  <button onClick={() => runBulk({ type: "delete" })} disabled={bulkBusy} className="btn-danger !px-2 !py-1 text-xs">Delete</button>
                  <button onClick={() => setSelected(new Set())} className="text-xs text-brand-inkFaint hover:underline">Clear</button>
                </>
              )}
              {bulkMsg && <span className="text-xs text-brand-greenDark font-semibold">{bulkMsg}</span>}
            </div>
          )}

          <div className="space-y-2">
            {filtered.map((t) => (
              <div key={t.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => toggleSel(t.id)}
                  className="w-4 h-4 mt-4 accent-[#4CAB3E] shrink-0 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <TaskRow
                    task={t}
                    teamMembers={teamMembers}
                    canEdit={isAdmin || editable.has(t.projectId)}
                  />
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="card p-10 text-center bg-white">
                <p className="text-sm text-brand-inkSoft">
                  {view === "mine"
                    ? "Nothing assigned to you right now."
                    : view === "assigned"
                    ? "You haven't assigned anything to anyone yet."
                    : "No tasks match these filters."}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "ok" }: { label: string; value: number; tone?: "ok" | "bad" | "warn" }) {
  const color = tone === "bad" ? "#C0392B" : tone === "warn" ? "#E8743B" : "#1C1C1C";
  return (
    <div className="bg-white border border-brand-line rounded-md p-3">
      <p className="font-mono text-[9px] font-bold tracking-widest text-brand-greenDark uppercase">{label}</p>
      <p className="font-heading text-xl font-extrabold" style={{ color }}>{value}</p>
    </div>
  );
}
