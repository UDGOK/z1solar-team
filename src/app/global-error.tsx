"use client";

/** Last-resort handler for errors in the root layout itself. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F5F9F3", padding: "40px 16px", textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1C1C1C" }}>Z1Power Team Hub</h1>
        <p style={{ color: "#3A3A3A", fontSize: 14 }}>Something went wrong loading the app.</p>
        {error.digest && <p style={{ color: "#8A8A85", fontSize: 12, fontFamily: "monospace" }}>Ref: {error.digest}</p>}
        <button onClick={reset} style={{ marginTop: 16, padding: "10px 20px", background: "#4CAB3E", color: "#fff", border: 0, borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
