"use client";

import { useState, useTransition } from "react";
import { saveRole, deleteRole, assignRole } from "@/lib/actions";

export type RoleItem = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  rank: number;
  memberCount: number;
  [key: string]: any;
};

const GLOBAL_CAPS: { key: string; label: string; hint: string }[] = [
  { key: "canCreateProjects", label: "Create projects", hint: "Becomes owner of what they create" },
  { key: "canViewAllProjects", label: "View all projects", hint: "Sees every project without being granted each one" },
  { key: "canEditAllProjects", label: "Edit all projects", hint: "Full edit rights everywhere" },
  { key: "canDeleteAnyProject", label: "Delete any project", hint: "Not just their own" },
  { key: "canViewAllFinancials", label: "View all financials", hint: "Budgets across every project" },
  { key: "canEditAllFinancials", label: "Edit all financials", hint: "Change budgets anywhere" },
  { key: "canManageTeam", label: "Manage team", hint: "Add, edit, remove members" },
  { key: "canManageRoles", label: "Manage roles", hint: "Create and edit roles like this one" },
  { key: "canSendAlerts", label: "Send alerts", hint: "Push must-acknowledge alerts" },
  { key: "canManageTradeShows", label: "Manage trade shows", hint: "Add and edit shows" },
  { key: "canViewReports", label: "View reports", hint: "Cross-project reporting" },
  { key: "canManageCategories", label: "Manage categories", hint: "Create, rename and delete project categories" },
  { key: "canViewMeetings", label: "View meetings", hint: "See the meetings area at all" },
  { key: "canManageMeetings", label: "Manage meetings", hint: "Schedule, edit and delete meetings" },
  { key: "canTakeMeetingNotes", label: "Take meeting notes", hint: "Write notes on any meeting" },
  { key: "canViewResources", label: "View resources", hint: "See flyers, templates and the knowledge base" },
  { key: "canManageResources", label: "Manage resources", hint: "Add, edit and remove resources" },
  { key: "canViewSms", label: "View SMS", hint: "See the text message inbox" },
  { key: "canSendSms", label: "Send SMS", hint: "Text people from inside the app" },
  { key: "canManageSmsContacts", label: "Manage SMS contacts", hint: "Approve which outside numbers may text in" },
  { key: "canRequestPurchases", label: "Raise purchase requests", hint: "Ask to buy materials, passes, marketing" },
  { key: "canApprovePurchases", label: "Approve purchases", hint: "Sign off spend up to $25,000" },
  { key: "canViewAllPurchases", label: "View all purchases", hint: "See requests across the whole company" },
  { key: "canRecordPayments", label: "Record payments", hint: "Mark invoices as paid" },
];

const DEFAULTS: { key: string; label: string }[] = [
  { key: "defaultCanEditTalkingPoints", label: "Edit talking points" },
  { key: "defaultCanEditKeyDates", label: "Edit key dates" },
  { key: "defaultCanEditTodos", label: "Edit to-dos" },
  { key: "defaultCanEditQuestions", label: "Edit questions" },
  { key: "defaultCanEditTeam", label: "Edit team roster" },
  { key: "defaultCanViewFiles", label: "View files" },
  { key: "defaultCanUploadFiles", label: "Upload files" },
  { key: "defaultCanViewFinancials", label: "View financials" },
  { key: "defaultCanEditFinancials", label: "Edit financials" },
  { key: "defaultCanEditStatus", label: "Edit status" },
];

function blankRole(): RoleItem {
  const r: any = { id: "", name: "", description: "", isSystem: false, rank: 20, memberCount: 0 };
  for (const c of GLOBAL_CAPS) r[c.key] = false;
  for (const d of DEFAULTS) r[d.key] = d.key === "defaultCanViewFiles" || d.key === "defaultCanEditTodos";
  return r;
}

export default function RoleManager({
  roles,
  members,
}: {
  roles: RoleItem[];
  members: { id: string; name: string; roleId: string | null; isSystemAdmin: boolean }[];
}) {
  const [editing, setEditing] = useState<RoleItem | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    if (!editing) return;
    setError(null);
    // Send only the fields saveRole expects. The server whitelists as well,
    // but keeping the payload clean makes failures easier to reason about.
    const { id, memberCount, isSystem, createdAt, updatedAt, _count, ...payload } = editing as any;
    startTransition(async () => {
      try {
        await saveRole(id || null, payload as any);
        setEditing(null);
      } catch (e: any) {
        setError(e?.message || "Couldn't save.");
      }
    });
  }

  function remove(r: RoleItem) {
    if (!confirm(`Delete the "${r.name}" role?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteRole(r.id);
      } catch (e: any) {
        setError(e?.message || "Couldn't delete.");
      }
    });
  }

  function setRoleFor(memberId: string, roleId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await assignRole(memberId, roleId || null);
      } catch (e: any) {
        setError(e?.message || "Couldn't assign.");
      }
    });
  }

  if (editing) {
    const e = editing;
    const set = (patch: any) => setEditing({ ...e, ...patch });
    return (
      <div className="card p-5 bg-white space-y-4">
        <p className="kicker">{e.id ? `Edit Role — ${e.name}` : "New Role"}</p>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="label">Role Name</label>
            <input
              className="input"
              value={e.name}
              disabled={e.isSystem}
              onChange={(ev) => set({ name: ev.target.value })}
              placeholder="Supervisor"
            />
            {e.isSystem && <p className="text-[11px] text-brand-inkFaint mt-1">Built-in role — name is fixed.</p>}
          </div>
          <div>
            <label className="label">Rank</label>
            <input
              type="number"
              className="input"
              value={e.rank}
              onChange={(ev) => set({ rank: Number(ev.target.value) })}
            />
            <p className="text-[11px] text-brand-inkFaint mt-1">Higher = more authority.</p>
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <input className="input" value={e.description || ""} onChange={(ev) => set({ description: ev.target.value })} />
        </div>

        <div>
          <p className="kicker mb-2">What this role can do</p>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {GLOBAL_CAPS.map((c) => (
              <label key={c.key} className="flex items-start gap-2 cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={!!e[c.key]}
                  onChange={(ev) => set({ [c.key]: ev.target.checked })}
                  className="w-4 h-4 mt-0.5 accent-[#4CAB3E]"
                />
                <span>
                  <span className="text-sm text-brand-ink">{c.label}</span>
                  <span className="block text-[10px] text-brand-inkFaint">{c.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="kicker mb-1">Default project permissions</p>
          <p className="text-[11px] text-brand-inkFaint mb-2">
            Suggested starting point when someone with this role is granted a project. You can still override per project.
          </p>
          <div className="grid sm:grid-cols-3 gap-1.5">
            {DEFAULTS.map((d) => (
              <label key={d.key} className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={!!e[d.key]}
                  onChange={(ev) => set({ [d.key]: ev.target.checked })}
                  className="w-3.5 h-3.5 accent-[#4CAB3E]"
                />
                <span className="text-brand-inkSoft">{d.label}</span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button onClick={save} disabled={isPending} className="btn-primary text-sm">
            {isPending ? "Saving…" : "Save Role"}
          </button>
          <button onClick={() => { setEditing(null); setError(null); }} className="btn-secondary text-sm">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="card p-5 bg-white">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <p className="kicker">Roles</p>
            <p className="text-xs text-brand-inkFaint">
              Define what each kind of team member can do across the whole system.
            </p>
          </div>
          <button onClick={() => setEditing(blankRole())} className="btn-primary text-xs">+ New Role</button>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="space-y-2">
          {roles.map((r) => {
            const caps = GLOBAL_CAPS.filter((c) => r[c.key]);
            const open = expanded === r.id;
            return (
              <div key={r.id} className="border border-brand-line rounded-md">
                <div className="flex items-center justify-between gap-3 px-3 py-2 flex-wrap">
                  <button onClick={() => setExpanded(open ? null : r.id)} className="flex items-center gap-2 text-left min-w-0">
                    <span className="text-brand-inkFaint text-xs">{open ? "▾" : "▸"}</span>
                    <span className="font-semibold text-brand-ink text-sm">{r.name}</span>
                    {r.isSystem && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white bg-brand-inkFaint">BUILT-IN</span>
                    )}
                    <span className="text-[11px] text-brand-inkFaint">
                      {caps.length} {caps.length === 1 ? "capability" : "capabilities"} · {r.memberCount}{" "}
                      {r.memberCount === 1 ? "member" : "members"} · rank {r.rank}
                    </span>
                  </button>
                  <span className="flex gap-1 shrink-0">
                    <button onClick={() => setEditing({ ...r })} className="btn-secondary !px-2 !py-1 text-[11px]">Edit</button>
                    {!r.isSystem && (
                      <button onClick={() => remove(r)} disabled={isPending} className="btn-danger !px-2 !py-1 text-[11px]">Delete</button>
                    )}
                  </span>
                </div>
                {open && (
                  <div className="px-3 pb-3 border-t border-brand-line pt-2">
                    {r.description && <p className="text-xs text-brand-inkSoft mb-2">{r.description}</p>}
                    {caps.length === 0 ? (
                      <p className="text-xs text-brand-inkFaint italic">No global capabilities — project access only.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {caps.map((c) => (
                          <span key={c.key} className="px-1.5 py-0.5 rounded text-[10px] bg-brand-greenTint text-brand-greenDark font-semibold">
                            {c.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-5 bg-white">
        <p className="kicker mb-1">Assign Roles</p>
        <p className="text-xs text-brand-inkFaint mb-3">
          System administrators always keep full access regardless of the role shown here.
        </p>
        <div className="space-y-1.5">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-brand-line last:border-0">
              <span className="text-sm font-semibold text-brand-ink">
                {m.name}
                {m.isSystemAdmin && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white bg-brand-amber">SYSTEM ADMIN</span>
                )}
              </span>
              <select
                className="input !py-1 text-xs !w-auto"
                value={m.roleId || ""}
                onChange={(ev) => setRoleFor(m.id, ev.target.value)}
                disabled={isPending}
              >
                <option value="">— no role —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
