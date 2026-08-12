"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "That Google account isn't on the Z1Power team list. Ask an admin to add your email first.",
  CredentialsSignin: "Incorrect email or password.",
  Default: "Something went wrong signing in. Try again.",
};

function LoginCard() {
  const params = useSearchParams();
  const router = useRouter();
  const errorCode = params.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    errorCode ? ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.Default : null
  );
  const [loading, setLoading] = useState(false);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError(ERROR_MESSAGES.CredentialsSignin);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="card p-6 bg-white space-y-5">
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className="w-full flex items-center justify-center gap-3 rounded-md border border-brand-line bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-brand-greenTint transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.63z" />
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
          <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
        </svg>
        Sign in with Google
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-brand-line" />
        <span className="text-[11px] font-mono tracking-widest text-brand-inkFaint">OR</span>
        <div className="flex-1 h-px bg-brand-line" />
      </div>

      <form onSubmit={handleCredentials} className="space-y-3 text-left">
        <div>
          <label className="label">Email</label>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-greenTint px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <img src="/logo.png" alt="Z1Power" className="h-10 w-auto mx-auto mb-4" />
        <p className="kicker mb-2">[ Z1POWER — TEAM HUB ]</p>
        <h1 className="font-heading text-4xl font-extrabold text-brand-ink mb-8">Sign In</h1>

        <Suspense fallback={<div className="card p-6 bg-white h-[380px]" />}>
          <LoginCard />
        </Suspense>

        <p className="text-xs text-brand-inkFaint mt-4">
          Accounts are created by an admin. If you don&rsquo;t have access yet, ask Yasir or Mohammad.
        </p>
      </div>
    </main>
  );
}
