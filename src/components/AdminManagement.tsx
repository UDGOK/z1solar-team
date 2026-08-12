"use client";

import { useState, useTransition } from "react";
import { promoteToAdmin, revokeAdmin } from "@/lib/actions";

type Member = { id: string; name: string; email: string | null; role: string };

export default function AdminManagement({ members, currentAdminId }: { members: Member[]; currentAdminId?: string }) {
  return (
    <div className="card p-5 bg-white space-y-4">
      <p className="kicker">Manage Admins</p>
      <p className="text-xs text-brand-inkFaint">
        Admins can see project financials, create and delete projects, and promote/revoke other admins. Everyone
        else uses the shared Team Password and can't do any of that.
      </p>
      <div className="divide-y divide-brand-line">
        {members.map((m) => (
          <MemberRow key={m.id} member={m} isSelf={m.id === currentAdminId} />
        ))}
      </div>
    </div>
  );
}

function MemberRow({ member, isSelf }: { member: Member; isSelf: boolean }) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(member.email || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isAdmin = member.role === "ADMIN";

  function handlePromote(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await promoteToAdmin(member.id, email, password);
        setEditing(false);
        setPassword("");
      } catch (err: any) {
        setError(err?.message || "Something went wrong.");
      }
    });
  }

  function handleRevoke() {
    if (!confirm(`Remove admin access for ${member.name}? They'll go back to using the shared team password.`)) return;
    startTransition(async () => {
      try {
        await revokeAdmin(member.id);
      } catch (err: any) {
        setError(err?.message || "Something went wrong.");
      }
    });
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-brand-ink">
            {member.name} {isSelf && <span className="text-xs text-brand-inkFaint">(you)</span>}
          </p>
          {isAdmin && member.email && <p className="text-xs text-brand-inkFaint">{member.email}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin ? (
            <>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider text-white bg-brand-amber">
                ADMIN
              </span>
              {!isSelf && (
                <button onClick={handleRevoke} disabled={isPending} className="btn-danger text-xs">
                  Revoke
                </button>
              )}
            </>
          ) : editing ? null : (
            <button onClick={() => setEditing(true)} className="btn-secondary text-xs">
              Make Admin
            </button>
          )}
        </div>
      </div>

      {!isAdmin && editing && (
        <form onSubmit={handlePromote} className="mt-3 grid sm:grid-cols-3 gap-2 items-end">
          <div>
            <label className="label">Email (their login)</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Set Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 text-xs">
              {isPending ? "Saving…" : "Confirm"}
            </button>
            <button type="button" className="btn-secondary text-xs" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          {error && <p className="text-xs text-red-600 sm:col-span-3">{error}</p>}
        </form>
      )}
    </div>
  );
}
