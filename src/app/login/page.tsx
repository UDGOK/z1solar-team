"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { login, loginAdmin } from "@/lib/actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"team" | "admin">("team");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleTeamSubmit(e: React.FormEvent) {
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

  function handleAdminSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await loginAdmin(email, adminPassword);
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

        <div className="flex rounded-md border border-brand-line overflow-hidden mb-4">
          <button
            type="button"
            onClick={() => { setMode("team"); setError(null); }}
            className={`flex-1 py-2 text-sm font-semibold ${mode === "team" ? "bg-brand-green text-white" : "bg-white text-brand-inkSoft hover:bg-brand-greenTint"}`}
          >
            Team Login
          </button>
          <button
            type="button"
            onClick={() => { setMode("admin"); setError(null); }}
            className={`flex-1 py-2 text-sm font-semibold ${mode === "admin" ? "bg-brand-green text-white" : "bg-white text-brand-inkSoft hover:bg-brand-greenTint"}`}
          >
            Admin Login
          </button>
        </div>

        {mode === "team" ? (
          <form onSubmit={handleTeamSubmit} className="card p-6 space-y-4 bg-white">
            <div>
              <label className="label" htmlFor="password">Team Password</label>
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
        ) : (
          <form onSubmit={handleAdminSubmit} className="card p-6 space-y-4 bg-white">
            <div>
              <label className="label" htmlFor="email">Admin Email</label>
              <input
                id="email"
                type="email"
                autoFocus
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@z1power.com"
              />
            </div>
            <div>
              <label className="label" htmlFor="adminPassword">Password</label>
              <input
                id="adminPassword"
                type="password"
                className="input"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={isPending} className="btn-primary w-full">
              {isPending ? "Signing in…" : "Sign In as Admin"}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-brand-inkFaint mt-4">
          {mode === "team"
            ? "One shared password for the whole team. Ask an admin if you don't have it."
            : "Admin accounts have full access, including financials and project management."}
        </p>
      </div>
    </main>
  );
}
