"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/actions";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await login(password);
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(res.error || "Something went wrong.");
      }
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-greenTint px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Z1Power" className="h-10 w-auto mx-auto mb-4" />
          <p className="kicker mb-2">[ Z1POWER — TEAM HUB ]</p>
          <h1 className="font-heading text-4xl font-extrabold text-brand-ink">Sign In</h1>
        </div>
        <form onSubmit={handleSubmit} className="card p-6 space-y-4 bg-white">
          <div>
            <label className="label" htmlFor="password">
              Team Password
            </label>
            <input
              id="password"
              type="password"
              autoFocus
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={isPending} className="btn-primary w-full">
            {isPending ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <p className="text-center text-xs text-brand-inkFaint mt-4">
          One shared password for the whole team. Ask an admin if you don't have it.
        </p>
      </div>
    </main>
  );
}
