"use client";

import { useState, useTransition } from "react";
import { changeOwnPassword } from "@/lib/actions";

export default function ChangeOwnPasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) {
      setMsg({ type: "error", text: "New passwords don't match." });
      return;
    }
    startTransition(async () => {
      const res = await changeOwnPassword(current, next);
      if (res.ok) {
        setMsg({ type: "success", text: hasPassword ? "Password updated." : "Password set — you can now sign in with email and password." });
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        setMsg({ type: "error", text: res.error || "Something went wrong." });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 bg-white space-y-3 max-w-sm">
      <p className="kicker">{hasPassword ? "Change My Password" : "Set a Password"}</p>
      {!hasPassword && (
        <p className="text-xs text-brand-inkFaint">
          You currently sign in with Google. Setting a password lets you sign in either way.
        </p>
      )}
      {hasPassword && (
        <div>
          <label className="label">Current Password</label>
          <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
      )}
      <div>
        <label className="label">New Password</label>
        <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters" />
      </div>
      <div>
        <label className="label">Confirm New Password</label>
        <input type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {msg && (
        <p className={`text-sm ${msg.type === "error" ? "text-red-600" : "text-brand-greenDark"}`}>{msg.text}</p>
      )}
      <button type="submit" disabled={isPending} className="btn-primary">
        {isPending ? "Saving…" : hasPassword ? "Update Password" : "Set Password"}
      </button>
    </form>
  );
}
