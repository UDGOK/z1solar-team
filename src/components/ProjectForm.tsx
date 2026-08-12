"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProject, updateProject, type ProjectInput } from "@/lib/actions";
import { toDateInputValue } from "@/lib/format";
import { ALL_TRUE, type ProjectPermissions } from "@/lib/permissionTypes";
import AssigneePicker from "./AssigneePicker";

const CATEGORIES = ["Solar & Battery", "Other Projects", "Other Matters", "New Project"];
const STATUSES = ["Planning", "On Track", "At Risk", "Delayed", "Complete"];

type TeamMemberOption = { id: string; name: string };

type InitialData = {
  id: string;
  title: string;
  category: string;
  leadId: string | null;
  members: { memberId: string; role: string | null; tasks: string | null }[];
  talkingPoints: { text: string }[];
  keyDates: { milestone: string; date: Date | string | null }[];
  todos: { text: string; done: boolean; assignees?: { memberId: string }[]; dueDate?: Date | string | null }[];
  questions: { text: string; resolved: boolean }[];
  estBudget: number;
  committed: number;
  actualSpend: number;
  q3Proj: number;
  q4Proj: number;
  q1Proj: number;
  q2Proj: number;
  notes: string | null;
  status: string;
  completionPct: number;
};

export default function ProjectForm({
  teamMembers,
  initial,
  isAdmin = false,
  perms = ALL_TRUE,
}: {
  teamMembers: TeamMemberOption[];
  initial?: InitialData;
  isAdmin?: boolean;
  perms?: ProjectPermissions;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title || "");
  const [category, setCategory] = useState(initial?.category || CATEGORIES[0]);
  const [leadId, setLeadId] = useState(initial?.leadId || "");
  const [members, setMembers] = useState(
    initial?.members.map((m) => ({ memberId: m.memberId, role: m.role || "", tasks: m.tasks || "" })) || [
      { memberId: "", role: "", tasks: "" },
    ]
  );
  const [talkingPoints, setTalkingPoints] = useState(
    initial?.talkingPoints.map((t) => t.text) || [""]
  );
  const [keyDates, setKeyDates] = useState(
    initial?.keyDates.map((k) => ({ milestone: k.milestone, date: toDateInputValue(k.date) })) || [
      { milestone: "", date: "" },
      { milestone: "", date: "" },
      { milestone: "", date: "" },
    ]
  );
  const [todos, setTodos] = useState(
    initial?.todos.map((t) => ({
      text: t.text,
      done: t.done,
      assigneeIds: (t.assignees || []).map((a) => a.memberId),
      dueDate: toDateInputValue(t.dueDate ?? null),
    })) || [
      { text: "", done: false, assigneeIds: [] as string[], dueDate: "" },
      { text: "", done: false, assigneeIds: [] as string[], dueDate: "" },
      { text: "", done: false, assigneeIds: [] as string[], dueDate: "" },
    ]
  );
  const [questions, setQuestions] = useState(
    initial?.questions.map((q) => ({ text: q.text, resolved: q.resolved })) || [
      { text: "", resolved: false },
      { text: "", resolved: false },
    ]
  );

  const [estBudget, setEstBudget] = useState(initial?.estBudget ?? 0);
  const [committed, setCommitted] = useState(initial?.committed ?? 0);
  const [actualSpend, setActualSpend] = useState(initial?.actualSpend ?? 0);
  const [q3Proj, setQ3Proj] = useState(initial?.q3Proj ?? 0);
  const [q4Proj, setQ4Proj] = useState(initial?.q4Proj ?? 0);
  const [q1Proj, setQ1Proj] = useState(initial?.q1Proj ?? 0);
  const [q2Proj, setQ2Proj] = useState(initial?.q2Proj ?? 0);
  const [notes, setNotes] = useState(initial?.notes || "");
  const [status, setStatus] = useState(initial?.status || "Planning");
  const [completionPct, setCompletionPct] = useState(initial?.completionPct ?? 0);

  const membersOps = makeOps(members, setMembers);
  const keyDatesOps = makeOps(keyDates, setKeyDates);
  const todosOps = makeOps(todos, setTodos);
  const questionsOps = makeOps(questions, setQuestions);


  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Project title is required.");
      return;
    }
    const payload: ProjectInput = {
      title,
      category,
      leadId: leadId || null,
      members,
      talkingPoints,
      keyDates,
      todos: todos.map((t) => ({ text: t.text, done: t.done, assigneeIds: t.assigneeIds, dueDate: t.dueDate || null })),
      questions,
      estBudget: Number(estBudget) || 0,
      committed: Number(committed) || 0,
      actualSpend: Number(actualSpend) || 0,
      q3Proj: Number(q3Proj) || 0,
      q4Proj: Number(q4Proj) || 0,
      q1Proj: Number(q1Proj) || 0,
      q2Proj: Number(q2Proj) || 0,
      notes,
      status,
      completionPct: Number(completionPct) || 0,
    };
    startTransition(async () => {
      try {
        if (initial) {
          await updateProject(initial.id, payload);
        } else {
          await createProject(payload);
        }
      } catch (err: any) {
        setError(err?.message || "Something went wrong.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}

      {/* Title / Category / Lead — admin only */}
      {isAdmin && (
      <section className="card p-5 bg-white">
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Project Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Carson" />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="label">Lead</label>
          <select className="input sm:max-w-xs" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            <option value="">— select lead —</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </section>
      )}

      {/* Progress — needs canEditStatus */}
      {perms.canEditStatus && (
      <section className="card p-5 bg-white">
        <p className="kicker mb-3">Progress</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Completion — {completionPct}%</label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={completionPct}
              onChange={(e) => setCompletionPct(Number(e.target.value))}
              className="w-full accent-[#4CAB3E] mt-2"
            />
          </div>
        </div>
      </section>
      )}

      {/* Team — needs canEditTeam */}
      {perms.canEditTeam && (
      <section className="card p-5 bg-white">
        <p className="kicker mb-3">Team</p>
        <div className="space-y-3">
          {members.map((m, i) => (
            <div key={i} className="grid sm:grid-cols-[1.2fr_1fr_1.6fr_auto] gap-2 items-start">
              <select
                className="input"
                value={m.memberId}
                onChange={(e) => membersOps.update(i, { ...m, memberId: e.target.value })}
              >
                <option value="">— select person —</option>
                {teamMembers.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Role on project"
                value={m.role}
                onChange={(e) => membersOps.update(i, { ...m, role: e.target.value })}
              />
              <input
                className="input"
                placeholder="Task(s) assigned"
                value={m.tasks}
                onChange={(e) => membersOps.update(i, { ...m, tasks: e.target.value })}
              />
              <RemoveBtn onClick={() => membersOps.remove(i)} />
            </div>
          ))}
        </div>
        <AddBtn label="+ Add team member" onClick={() => setMembers([...members, { memberId: "", role: "", tasks: "" }])} />
      </section>

      )}

      {/* Talking points — needs canEditTalkingPoints */}
      {perms.canEditTalkingPoints && (
      <ListSection
        title="Talking Points"
        items={talkingPoints}
        setItems={setTalkingPoints}
        placeholder="Add talking point"
        addLabel="+ Add talking point"
        emptyValue=""
      />
      )}

      {/* Key Dates + To-Do side by side */}
      <div className="grid lg:grid-cols-2 gap-6">
        {perms.canEditKeyDates && (
        <section className="card p-5 bg-white">
          <p className="kicker mb-3">Key Dates</p>
          <div className="space-y-2">
            {keyDates.map((k, i) => (
              <div key={i} className="grid grid-cols-[130px_1fr_auto] gap-2 items-center">
                <input
                  type="date"
                  className="input"
                  value={k.date}
                  onChange={(e) => keyDatesOps.update(i, { ...k, date: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Milestone"
                  value={k.milestone}
                  onChange={(e) => keyDatesOps.update(i, { ...k, milestone: e.target.value })}
                />
                <RemoveBtn onClick={() => keyDatesOps.remove(i)} />
              </div>
            ))}
          </div>
          <AddBtn label="+ Add key date" onClick={() => setKeyDates([...keyDates, { milestone: "", date: "" }])} />
        </section>
        )}

        {perms.canEditTodos && (
        <section className="card p-5 bg-white">
          <p className="kicker mb-3">To-Do</p>
          <div className="space-y-2">
            {todos.map((t, i) => (
              <div key={i} className="border border-brand-line rounded-md p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={(e) => todosOps.update(i, { ...t, done: e.target.checked })}
                    className="w-4 h-4 accent-[#4CAB3E]"
                  />
                  <input
                    className="input flex-1"
                    placeholder="Add action item"
                    value={t.text}
                    onChange={(e) => todosOps.update(i, { ...t, text: e.target.value })}
                  />
                  <RemoveBtn onClick={() => todosOps.remove(i)} />
                </div>
                <div className="grid grid-cols-2 gap-2 pl-6">
                  <div>
                    <label className="label !text-[10px]">Assign to</label>
                    <AssigneePicker
                      teamMembers={teamMembers}
                      selected={t.assigneeIds}
                      onChange={(ids) => todosOps.update(i, { ...t, assigneeIds: ids })}
                      compact
                    />
                  </div>
                  <div>
                    <label className="label !text-[10px]">Due date</label>
                    <input
                      type="date"
                      className="input !py-1 text-xs"
                      value={t.dueDate}
                      onChange={(e) => todosOps.update(i, { ...t, dueDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <AddBtn
            label="+ Add action item"
            onClick={() => setTodos([...todos, { text: "", done: false, assigneeIds: [], dueDate: "" }])}
          />
        </section>
        )}
      </div>

      {/* Open Questions — needs canEditQuestions */}
      {perms.canEditQuestions && (
      <section className="card p-5 bg-white">
        <p className="kicker mb-3">Open Questions</p>
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={q.resolved}
                title="Resolved"
                onChange={(e) => questionsOps.update(i, { ...q, resolved: e.target.checked })}
                className="w-4 h-4 accent-[#4CAB3E]"
              />
              <input
                className="input flex-1"
                placeholder="Add open question"
                value={q.text}
                onChange={(e) => questionsOps.update(i, { ...q, text: e.target.value })}
              />
              <RemoveBtn onClick={() => questionsOps.remove(i)} />
            </div>
          ))}
        </div>
        <AddBtn label="+ Add question" onClick={() => setQuestions([...questions, { text: "", resolved: false }])} />
      </section>
      )}

      {/* Financials — needs canEditFinancials */}
      {perms.canEditFinancials && (
        <section className="card p-5 bg-white">
          <p className="kicker mb-3">Financials & Projections</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <MoneyField label="Est. Total Budget" value={estBudget} onChange={setEstBudget} />
            <MoneyField label="Committed to Date" value={committed} onChange={setCommitted} />
            <MoneyField label="Actual Spend to Date" value={actualSpend} onChange={setActualSpend} />
          </div>
          <div className="grid sm:grid-cols-4 gap-4 mt-4">
            <MoneyField label="Q3 2026 Projected" value={q3Proj} onChange={setQ3Proj} />
            <MoneyField label="Q4 2026 Projected" value={q4Proj} onChange={setQ4Proj} />
            <MoneyField label="Q1 2027 Projected" value={q1Proj} onChange={setQ1Proj} />
            <MoneyField label="Q2 2027 Projected" value={q2Proj} onChange={setQ2Proj} />
          </div>
        </section>
      )}

      {perms.canEditFinancials && (
      <section className="card p-5 bg-white">
        <p className="kicker mb-3">Notes</p>
        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </section>
      )}

      <p className="text-xs text-brand-inkFaint italic">
        Only the sections you have permission to edit are shown. Everything else is left untouched when you save.
      </p>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? "Saving…" : initial ? "Save Changes" : "Create Project"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ListSection({
  title,
  items,
  setItems,
  placeholder,
  addLabel,
  emptyValue,
}: {
  title: string;
  items: string[];
  setItems: (v: string[]) => void;
  placeholder: string;
  addLabel: string;
  emptyValue: string;
}) {
  return (
    <section className="card p-5 bg-white">
      <p className="kicker mb-3">{title}</p>
      <div className="space-y-2">
        {items.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="input flex-1"
              placeholder={placeholder}
              value={v}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                setItems(next);
              }}
            />
            <RemoveBtn onClick={() => setItems(items.filter((_, idx) => idx !== i))} />
          </div>
        ))}
      </div>
      <AddBtn label={addLabel} onClick={() => setItems([...items, emptyValue])} />
    </section>
  );
}

function MoneyField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        className="input"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-3 text-sm font-semibold text-brand-greenDark hover:underline">
      {label}
    </button>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-8 h-8 shrink-0 rounded-md border border-brand-line text-brand-inkFaint hover:text-red-600 hover:border-red-200 flex items-center justify-center"
      title="Remove"
    >
      ×
    </button>
  );
}

function makeOps<T>(items: T[], setItems: (v: T[]) => void) {
  return {
    update: (i: number, next: T) => {
      const copy = [...items];
      copy[i] = next;
      setItems(copy);
    },
    remove: (i: number) => setItems(items.filter((_, idx) => idx !== i)),
  };
}
