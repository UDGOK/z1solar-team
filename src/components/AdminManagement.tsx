"use client";

import { useState, useTransition } from "react";
import { promoteToAdmin, revokeAdmin } from "@/lib/actions";

type Member = { id: string; name: string; email: string | null; role: string };

export default function AdminManagement({ members, currentMemberId }: { members: Member[]; currentMemberId?: string }) {
  return (
    <div className="card p-5 bg-white space-y-4">
      <p className="kicker">Manage Admins</p>
      <p className="text-xs text-brand-inkFaint">
        Admins can see project financials, create and delete projects, manage the team directory, and promote/revoke
        other admins. Everyone signs in with their own Google account — a person's email in Team Directory below is
        exactly what they sign in with, so make sure it's correct before promoting them.
      </p>
      <div className="divide-y divide-brand-line">
        {members.map((m) => (
          <MemberRow key={m.id} member={m} isSelf={m.id === currentMemberId} />
        ))}
      </div>
    </div>
  );
}

function MemberRow({ member, isSelf }: { member: Member; isSelf: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isAdmin = member.role === "ADMIN";

  function handlePromote() {
    if (!member.email) {
      setError("Add an email for this person in Team Directory first — that's what they'll sign in with.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await promoteToAdmin(member.id);
      } catch (err: any) {
        setError(err?.message || "Something went wrong.");
      }
    });
  }

  function handleRevoke() {
    if (!confirm(`Remove admin access for ${member.name}?`)) return;
    setError(null);
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
          <p className="text-xs text-brand-inkFaint">{member.email || "no email on file"}</p>
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
          ) : (
            <button onClick={handlePromote} disabled={isPending} className="btn-secondary text-xs">
              {isPending ? "Saving…" : "Make Admin"}
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
