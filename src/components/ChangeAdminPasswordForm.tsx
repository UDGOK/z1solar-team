"use client";

import { useState, useTransition } from "react";
import { changeAdminPassword } from "@/lib/actions";

export default function ChangeAdminPasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (next !== confirmPw) {
      setMessage({ type: "error", text: "New passwords don't match." });
      return;
    }
    startTransition(async () => {
      const res = await changeAdminPassword(current, next);
      if (res.ok) {
        setMessage({ type: "success", text: "Your admin password has been updated." });
        setCurrent("");
        setNext("");
        setConfirmPw("");
      } else {
        setMessage({ type: "error", text: res.error || "Something went wrong." });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 bg-white space-y-3 max-w-sm">
      <p className="kicker">Change Your Admin Password</p>
      <div>
        <label className="label">Current Password</label>
        <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div>
        <label className="label">New Password</label>
        <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div>
        <label className="label">Confirm New Password</label>
        <input type="password" className="input" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
      </div>
      {message && (
        <p className={`text-sm ${message.type === "error" ? "text-red-600" : "text-brand-greenDark"}`}>
          {message.text}
        </p>
      )}
      <button type="submit" disabled={isPending} className="btn-primary">
        {isPending ? "Updating…" : "Update My Password"}
      </button>
    </form>
  );
}
