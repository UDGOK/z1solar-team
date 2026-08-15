"use client";

import { useState, useTransition } from "react";
import { createMeetingImport, updateImportItem, applyMeetingImport, deleteMeetingImport } from "@/lib/actions";

export type ImportItem = {
  id: string;
  text: string;
  suggestedAssigneeIds: string[];
  suggestedDueDate: string | null;
  matchedNames: string | null;
  reason: string | null;
  confidence: string;
  accepted: boolean;
  origin: string;
  createdTodoId: string | null;
};
export type ImportRecord = {
  id: string;
  title: string;
  status: string;
  projectId: string | null;
  projectTitle: string | null;
  createdAt: string;
  itemCount: number;
  aiSummary: string | null;
  aiDecisions: string[];
  aiUsed: boolean;
  aiError: string | null;
  items: ImportItem[];
};

const CONF: Record<string, { bg: string; fg: string; label: string }> = {
  high: { bg: "#EAF3E7", fg: "#2F7328", label: "LIKELY" },
  medium: { bg: "#FAF3E8", fg: "#8B5A2B", label: "MAYBE" },
  low: { bg: "#F7F6F1", fg: "#8A8A85", label: "UNSURE" },
};

export default function MeetingImportPanel({
  imports, teamMembers, projects,
}: {
  imports: ImportRecord[];
  teamMembers: { id: string; name: string }[];
  projects: { id: string; title: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [raw, setRaw] = useState("");
  const [projectId, setProjectId] = useState("");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function act(fn: () => Promise<any>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try { await fn(); after?.(); }
      catch (e: any) { setError(e?.message || "Something went wrong."); }
    });
  }

  const draft = imports.find((i) => i.id === reviewing);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="kicker">Meeting Notes → Tasks</p>
          <p className="text-xs text-brand-inkFaint">
            Paste notes or a transcript. Nothing is created until you review and confirm each item.
          </p>
        </div>
        {!open && <button onClick={() => setOpen(true)} className="btn-primary text-xs">+ Import notes</button>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {open && (
        <div className="card p-5 bg-white space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">What meeting was this?</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly Operations — Aug 14" />
            </div>
            <div>
              <label className="label">Project</label>
              <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">— choose —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Notes or transcript</label>
            <textarea
              className="input font-mono text-xs"
              rows={10}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={"Paste anything — rough notes, bullet points, or a full transcript.\n\nRyan will order the 15-ton HVAC unit by Friday.\nAction: Muhammad - confirm 208V service is live\n- [ ] Ali to pull B200 pricing by Sept 1"}
            />
            <p className="text-[10px] text-brand-inkFaint mt-1">{raw.length} characters</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                act(async () => {
                  const res = await createMeetingImport({ title, rawText: raw, projectId: projectId || null });
                  setReviewing(res.id);
                }, () => { setRaw(""); setTitle(""); setOpen(false); })
              }
              disabled={isPending || !raw.trim()}
              className="btn-primary text-sm"
            >
              {isPending ? "Reading…" : "Find action items"}
            </button>
            <button onClick={() => setOpen(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {imports.map((imp) => (
        <div key={imp.id} className="bg-white border border-brand-line rounded-md">
          <div className="p-4 flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-white ${imp.status === "APPLIED" ? "bg-brand-greenDark" : "bg-brand-amber"}`}>
                  {imp.status === "APPLIED" ? "TASKS CREATED" : "NEEDS REVIEW"}
                </span>
                {imp.projectTitle && <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-greenTint text-brand-greenDark">{imp.projectTitle}</span>}
              </div>
              <p className="font-semibold text-sm text-brand-ink">{imp.title}</p>
              <p className="text-[11px] text-brand-inkFaint">
                {imp.itemCount} action item{imp.itemCount === 1 ? "" : "s"} found ·{" "}
                {new Date(imp.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setReviewing(reviewing === imp.id ? null : imp.id)} className="btn-secondary !px-2 !py-1 text-[11px]">
                {reviewing === imp.id ? "Close" : imp.status === "APPLIED" ? "View" : "Review"}
              </button>
              <button
                onClick={() => { if (confirm(`Remove "${imp.title}"? Tasks already created stay.`)) act(() => deleteMeetingImport(imp.id)); }}
                className="text-[11px] text-brand-inkFaint hover:text-red-600"
              >
                Remove
              </button>
            </div>
          </div>

          {reviewing === imp.id && (
            <div className="border-t border-brand-line p-4 space-y-2">
              {imp.aiError && (
                <div className="rounded bg-orange-50 border border-orange-200 p-2.5">
                  <p className="text-[11px] text-brand-amber">{imp.aiError}</p>
                </div>
              )}

              {imp.aiSummary && (
                <div className="rounded bg-brand-greenTint p-3">
                  <p className="kicker mb-1">Summary</p>
                  <p className="text-[13px] text-brand-inkSoft leading-relaxed whitespace-pre-wrap">{imp.aiSummary}</p>
                </div>
              )}

              {imp.aiDecisions.length > 0 && (
                <div className="rounded border border-brand-line p-3">
                  <p className="kicker mb-1.5">Decisions</p>
                  <ul className="space-y-1">
                    {imp.aiDecisions.map((d, i) => (
                      <li key={i} className="text-[13px] text-brand-inkSoft flex gap-2">
                        <span className="text-brand-green shrink-0">•</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {imp.items.length > 0 && <p className="kicker pt-1">Action items</p>}

              {imp.items.length === 0 && (
                <p className="text-sm text-brand-inkFaint">
                  No action items found. Try lines like &ldquo;Ryan will order the unit by Friday&rdquo; or &ldquo;Action: Ali - send specs&rdquo;.
                </p>
              )}
              {imp.items.map((item) => {
                const c = CONF[item.confidence] || CONF.low;
                const locked = imp.status === "APPLIED";
                return (
                  <div key={item.id} className={`border rounded p-3 ${item.accepted ? "border-brand-line" : "border-brand-line opacity-55"}`}>
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={item.accepted}
                        disabled={locked}
                        onChange={(e) => act(() => updateImportItem(item.id, { accepted: e.target.checked }))}
                        className="w-4 h-4 mt-1 accent-[#4CAB3E] shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: c.bg, color: c.fg }}>
                            {c.label}
                          </span>
                          <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            item.origin === "ai" ? "bg-brand-ink text-white" : "bg-brand-greenTint text-brand-inkSoft"
                          }`}>
                            {item.origin === "ai" ? "AI" : "RULE"}
                          </span>
                          {item.createdTodoId && <span className="text-[9px] text-brand-greenDark font-semibold">TASK CREATED</span>}
                        </div>
                        <input
                          className="input !py-1 text-sm"
                          defaultValue={item.text}
                          disabled={locked}
                          onBlur={(e) => { if (e.target.value !== item.text) act(() => updateImportItem(item.id, { text: e.target.value })); }}
                        />
                        <div className="grid sm:grid-cols-2 gap-2">
                          <div>
                            <label className="label !text-[9px]">Assign to</label>
                            <div className="flex flex-wrap gap-1">
                              {teamMembers.map((m) => {
                                const on = item.suggestedAssigneeIds.includes(m.id);
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    disabled={locked}
                                    onClick={() =>
                                      act(() =>
                                        updateImportItem(item.id, {
                                          assigneeIds: on
                                            ? item.suggestedAssigneeIds.filter((x) => x !== m.id)
                                            : [...item.suggestedAssigneeIds, m.id],
                                        })
                                      )
                                    }
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                      on ? "bg-brand-green text-white border-brand-green" : "bg-white text-brand-inkSoft border-brand-line"
                                    }`}
                                  >
                                    {m.name.split(" ")[0]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <label className="label !text-[9px]">Due</label>
                            <input
                              type="date"
                              className="input !py-1 text-xs"
                              disabled={locked}
                              defaultValue={item.suggestedDueDate ? item.suggestedDueDate.slice(0, 10) : ""}
                              onChange={(e) => act(() => updateImportItem(item.id, { dueDate: e.target.value || null }))}
                            />
                          </div>
                        </div>
                        {item.reason && <p className="text-[10px] text-brand-inkFaint italic">{item.reason}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}

              {imp.status !== "APPLIED" && imp.items.length > 0 && (
                <div className="pt-2 flex items-center gap-2 flex-wrap">
                  <select
                    className="input !py-1 text-xs !w-auto"
                    value={imp.projectId ?? projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    <option value="">Create tasks in…</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                  <button
                    onClick={() => {
                      const target = imp.projectId || projectId;
                      if (!target) { setError("Choose which project these tasks belong to."); return; }
                      act(() => applyMeetingImport(imp.id, target), () => setReviewing(null));
                    }}
                    disabled={isPending}
                    className="btn-primary text-xs"
                  >
                    {isPending ? "Creating…" : `Create ${imp.items.filter((i) => i.accepted).length} task(s)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
