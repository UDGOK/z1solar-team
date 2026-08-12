"use client";

import { useEffect } from "react";

/**
 * Catches any unhandled error in a page and shows a recoverable screen
 * instead of a white crash page.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-greenTint px-4">
      <div className="w-full max-w-md text-center">
        <img src="/logo.png" alt="Z1Power" className="h-8 w-auto mx-auto mb-4" />
        <div className="card p-6 bg-white">
          <p className="kicker mb-2">Something went wrong</p>
          <h1 className="font-heading text-xl font-extrabold text-brand-ink mb-2">
            This page hit an error
          </h1>
          <p className="text-sm text-brand-inkSoft mb-4">
            Your data is safe — nothing was lost. Try again, or head back to the dashboard.
          </p>
          {error.digest && (
            <p className="text-[11px] font-mono text-brand-inkFaint mb-4">Reference: {error.digest}</p>
          )}
          <div className="flex gap-2 justify-center">
            <button onClick={reset} className="btn-primary text-sm">Try again</button>
            <a href="/dashboard" className="btn-secondary text-sm">Dashboard</a>
          </div>
        </div>
      </div>
    </main>
  );
}
