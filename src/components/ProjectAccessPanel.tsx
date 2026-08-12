"use client";

import { useState, useTransition } from "react";
import { setProjectPermissions } from "@/lib/actions";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissionTypes";

type Row = { memberId: string; name: string; perms: Record<Permission, boolean> };

export default function ProjectAccessPanel({ projectId, rows: initialRows }: { projectId: string; rows: Row[] }) {
  const [rows, setRows] = useState(initialRows);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);

  function save(memberId: string, perms: Record<Permission, boolean>) {
    setRows((prev) => prev.map((r) => (r.memberId === memberId ? { ...r, perms } : r)));
    setSavingId(memberId);
    startTransition(async () => {
      await setProjectPermissions(projectId, memberId, perms);
      setSavingId(null);
    });
  }

  function toggle(memberId: string, key: Permission, value: boolean) {
    const row = rows.find((r) => r.memberId === memberId)!;
    let next = { ...row.perms, [key]: value };
    // Turning off "View project" clears everything — you can't edit what you can't see.
    if (key === "canView" && !value) {
      next = Object.fromEntries(Object.keys(next).map((k) => [k, false])) as Record<Permission, boolean>;
    }
    // Granting anything else implies they can at least view the project.
    if (key !== "canView" && value) next.canView = true;
    save(memberId, next);
  }

  function grantAll(memberId: string) {
    const next = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p.key, true])) as Record<Permission, boolean>;
    save(memberId, next);
  }

  function revokeAll(memberId: string) {
    const next = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p.key, false])) as Record<Permission, boolean>;
    save(memberId, next);
  }

  return (
    <div className="p-5 border-t border-brand-line">
      <p className="kicker mb-2">Access Control — This Project</p>
      <p className="text-xs text-brand-inkFaint mb-4">
        Members start with <strong>no access at all</strong>. Tick what each person may do here. Turning off
        &ldquo;View project&rdquo; removes every other permission automatically.
      </p>

      <div className="space-y-2">
        {rows.map((r) => {
          const granted = ALL_PERMISSIONS.filter((p) => r.perms[p.key]).length;
          const isOpen = expanded === r.memberId;
          return (
            <div key={r.memberId} className="border border-brand-line rounded-md bg-white">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : r.memberId)}
                  className="flex items-center gap-2 text-left"
                >
                  <span className="text-brand-inkFaint text-xs">{isOpen ? "▾" : "▸"}</span>
                  <span className="font-semibold text-brand-ink">{r.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider ${
                      r.perms.canView ? "bg-brand-green text-white" : "bg-brand-line text-brand-inkSoft"
                    }`}
                  >
                    {r.perms.canView ? `${granted} PERMISSION${granted === 1 ? "" : "S"}` : "NO ACCESS"}
                  </span>
                  {savingId === r.memberId && <span className="text-xs text-brand-inkFaint">saving…</span>}
                </button>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => grantAll(r.memberId)} className="btn-secondary text-[11px] !px-2 !py-1">
                    Grant all
                  </button>
                  <button type="button" onClick={() => revokeAll(r.memberId)} className="btn-secondary text-[11px] !px-2 !py-1">
                    Revoke all
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-brand-line px-4 py-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2 bg-brand-greenTint">
                  {ALL_PERMISSIONS.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={r.perms[p.key]}
                        onChange={(e) => toggle(r.memberId, p.key, e.target.checked)}
                        className="w-4 h-4 accent-[#4CAB3E]"
                      />
                      <span className={p.key === "canView" ? "font-semibold text-brand-ink" : "text-brand-inkSoft"}>
                        {p.label}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="text-sm text-brand-inkFaint">No non-admin team members yet.</p>
        )}
      </div>
    </div>
  );
}
