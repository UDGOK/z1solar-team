"use client";

import { useState, useTransition } from "react";
import { generateInviteLink, clearPassword } from "@/lib/actions";

type Member = { id: string; name: string; email: string | null; hasPassword: boolean };

export default function InviteManager({ members }: { members: Member[] }) {
  return (
    <div className="card p-5 bg-white space-y-4">
      <p className="kicker">Email &amp; Password Access</p>
      <p className="text-xs text-brand-inkFaint">
        For people without a Gmail address. Generate an invite link and send it to them — they set their own
        password (you never see it). They can also still sign in with Google if their email is a Google account.
      </p>
      <div className="divide-y divide-brand-line">
        {members.map((m) => (
          <MemberRow key={m.id} member={m} />
        ))}
        {members.length === 0 && <p className="text-sm text-brand-inkFaint">No team members yet.</p>}
      </div>
    </div>
  );
}

function MemberRow({ member }: { member: Member }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function makeLink() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await generateInviteLink(member.id);
        setLink(res.url);
      } catch (err: any) {
        setError(err?.message || "Couldn't create the link.");
      }
    });
  }

  function revoke() {
    if (!confirm(`Remove password access for ${member.name}? They'll still be able to use Google sign-in.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await clearPassword(member.id);
        setLink(null);
      } catch (err: any) {
        setError(err?.message || "Something went wrong.");
      }
    });
  }

  function copy() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-brand-ink">
            {member.name}{" "}
            {member.hasPassword && (
              <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider text-white bg-brand-green">
                PASSWORD SET
              </span>
            )}
          </p>
          <p className="text-xs text-brand-inkFaint truncate">{member.email || "no email on file"}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={makeLink} disabled={isPending || !member.email} className="btn-secondary text-xs">
            {isPending ? "…" : member.hasPassword ? "New link" : "Invite link"}
          </button>
          {member.hasPassword && (
            <button onClick={revoke} disabled={isPending} className="btn-danger text-xs">
              Revoke
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {link && (
        <div className="mt-3 p-3 rounded-md bg-brand-greenTint border border-brand-line">
          <p className="text-[11px] text-brand-inkFaint mb-2">
            Send this to {member.name}. It works once and expires in 7 days.
          </p>
          <div className="flex gap-2">
            <input readOnly value={link} onFocus={(e) => e.target.select()} className="input text-xs flex-1" />
            <button onClick={copy} className="btn-secondary text-xs shrink-0">
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
