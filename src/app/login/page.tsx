"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "That Google account isn't on the Z1Power team list. Ask an admin to add your email in Team Directory first.",
  Default: "Something went wrong signing in. Try again.",
};

function LoginCard() {
  const params = useSearchParams();
  const errorCode = params.get("error");
  const error = errorCode ? ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.Default : null;

  return (
    <div className="card p-6 bg-white">
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
      {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-greenTint px-4">
      <div className="w-full max-w-sm text-center">
        <img src="/logo.png" alt="Z1Power" className="h-10 w-auto mx-auto mb-4" />
        <p className="kicker mb-2">[ Z1POWER — TEAM HUB ]</p>
        <h1 className="font-heading text-4xl font-extrabold text-brand-ink mb-8">Sign In</h1>

        <Suspense fallback={<div className="card p-6 bg-white h-[68px]" />}>
          <LoginCard />
        </Suspense>

        <p className="text-xs text-brand-inkFaint mt-4">
          You must be on the Z1Power team list to sign in. Ask an admin if you don't have access yet.
        </p>
      </div>
    </main>
  );
}
