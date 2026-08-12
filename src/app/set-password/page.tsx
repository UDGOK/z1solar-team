"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setPasswordFromInvite } from "@/lib/actions";

function SetPasswordCard() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const res = await setPasswordFromInvite(token, password);
    setLoading(false);
    if (res.ok) {
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } else {
      setError(res.error || "Something went wrong.");
    }
  }

  if (!token) {
    return (
      <div className="card p-6 bg-white">
        <p className="text-sm text-red-600">
          This link is missing its invite token. Ask an admin for a fresh invite link.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card p-6 bg-white">
        <p className="font-heading font-bold text-brand-greenDark mb-1">Password set</p>
        <p className="text-sm text-brand-inkSoft">Taking you to the sign-in page…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 bg-white space-y-4 text-left">
      <div>
        <label className="label">New Password</label>
        <input
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          autoFocus
        />
      </div>
      <div>
        <label className="label">Confirm Password</label>
        <input
          type="password"
          className="input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Saving…" : "Set Password"}
      </button>
    </form>
  );
}

export default function SetPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-greenTint px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <img src="/logo.png" alt="Z1Power" className="h-10 w-auto mx-auto mb-4" />
        <p className="kicker mb-2">[ Z1POWER — TEAM HUB ]</p>
        <h1 className="font-heading text-3xl font-extrabold text-brand-ink mb-2">Set Your Password</h1>
        <p className="text-sm text-brand-inkSoft mb-8">
          Choose a password for your account. You can also sign in with Google using the same email.
        </p>

        <Suspense fallback={<div className="card p-6 bg-white h-[260px]" />}>
          <SetPasswordCard />
        </Suspense>
      </div>
    </main>
  );
}
