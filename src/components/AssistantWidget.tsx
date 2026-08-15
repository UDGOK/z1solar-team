"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { askAssistantAction } from "@/lib/assistantActions";

type Turn = { role: "user" | "assistant"; content: string };

/**
 * The assistant as a dockable panel in the bottom-right corner, available on
 * every page.
 *
 * Two things worth knowing about how this is built:
 *
 * 1. IT HOLDS NO DATA OF ITS OWN. Every answer comes from a server action that
 *    rebuilds the context from scratch for the signed-in person on each call.
 *    The browser is never sent the underlying project, financial or vendor
 *    data — only the answer. Anything this person may not see is never fetched,
 *    so there is nothing here to inspect in devtools and nothing to leak.
 *
 * 2. THE CONVERSATION IS DELIBERATELY NOT PERSISTED. It lives in component
 *    state and is gone on reload. A chat log spanning permission boundaries is
 *    a liability — if someone's access is reduced, a stored transcript would
 *    still hold answers built from what they used to be able to see.
 */
export default function AssistantWidget({
  memberName,
  isAdmin,
  configured,
}: {
  memberName: string;
  isAdmin: boolean;
  configured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Remember open/closed across navigations. Only the flag, never the content.
  useEffect(() => {
    try {
      setOpen(window.sessionStorage.getItem("z1-assistant-open") === "1");
    } catch {
      /* private browsing — default to closed */
    }
  }, []);
  useEffect(() => {
    try {
      window.sessionStorage.setItem("z1-assistant-open", open ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  // Escape closes it, which is what everyone tries first.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setError(null);
    setInput("");
    const next = [...turns, { role: "user" as const, content: q }];
    setTurns(next);
    setBusy(true);
    try {
      // Only the last few turns go back, to keep the request bounded on a long
      // conversation. The server rebuilds permissions every time regardless.
      const reply = await askAssistantAction(next.slice(-10));
      setTurns([...next, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setError(e?.message ?? "The assistant couldn't answer that.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open the assistant"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-brand-green px-4 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-brand-greenDark"
      >
        <span aria-hidden>✦</span>
        Assistant
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex h-[min(560px,calc(100vh-4rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border-2 border-dashed border-brand-greenDark bg-white shadow-2xl">
      {/* header */}
      <div className="flex items-center justify-between gap-2 border-b border-brand-line bg-brand-greenTint px-3 py-2.5">
        <div>
          <p className="kicker">[ Assistant ]</p>
          <p className="text-[11px] text-brand-inkFaint">
            {isAdmin ? "Full access" : "Scoped to what you can see"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/assistant"
            className="rounded px-2 py-1 text-[11px] text-brand-inkFaint hover:bg-white hover:text-brand-greenDark"
            title="Open the full page"
          >
            Expand
          </Link>
          {turns.length > 0 && (
            <button
              onClick={() => {
                setTurns([]);
                setError(null);
              }}
              className="rounded px-2 py-1 text-[11px] text-brand-inkFaint hover:bg-white hover:text-brand-greenDark"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            aria-label="Minimise the assistant"
            className="rounded px-2 py-1 text-base leading-none text-brand-inkFaint hover:bg-white hover:text-brand-ink"
          >
            &minus;
          </button>
        </div>
      </div>

      {/* transcript */}
      <div ref={scroller} className="flex-1 overflow-y-auto px-3 py-3">
        {!configured && (
          <div className="rounded-md border border-[#F0DCB0] bg-[#FFF8E7] px-3 py-2.5 text-xs text-[#7c5c11]">
            <b>Not configured.</b> <code>DEEPSEEK_API_KEY</code> isn&rsquo;t set in Vercel, so the
            assistant can&rsquo;t answer anything yet.
          </div>
        )}

        {configured && turns.length === 0 && (
          <div className="text-[12.5px] text-brand-inkSoft">
            <p className="font-heading font-bold text-brand-ink">Hello {memberName.split(" ")[0]}.</p>
            <p className="mt-1">
              Ask about projects, tasks, meetings, purchases or trade shows. I only see what
              you&rsquo;re allowed to see.
            </p>
            <div className="mt-3 space-y-1.5">
              {[
                "What's on my plate this week?",
                "Who are we meeting at Datacloud USA?",
                "Which flagged vendors have nobody chasing them?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="block w-full rounded-md border border-brand-line px-2.5 py-1.5 text-left text-[12px] text-brand-inkSoft hover:border-brand-green hover:bg-brand-greenTint"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={`mb-2.5 ${t.role === "user" ? "text-right" : ""}`}>
            <div
              className={`inline-block max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[12.5px] leading-relaxed ${
                t.role === "user"
                  ? "bg-brand-green text-white"
                  : "border border-brand-line bg-white text-brand-inkSoft"
              }`}
            >
              {t.content}
            </div>
          </div>
        ))}

        {busy && (
          <div className="mb-2.5">
            <div className="inline-block rounded-lg border border-brand-line bg-white px-3 py-2 text-[12.5px] text-brand-inkFaint">
              Thinking&hellip;
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="border-t border-brand-line p-2.5">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            className="input max-h-24 min-h-[38px] resize-none py-2 text-[13px]"
            placeholder={configured ? "Ask something…" : "Assistant not configured"}
            value={input}
            disabled={busy || !configured}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter makes a new line — the convention
              // everyone already has in their fingers from every other chat box.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            className="btn-primary px-3 py-2 text-sm"
            disabled={busy || !input.trim() || !configured}
            onClick={() => void send()}
          >
            Send
          </button>
        </div>
        <p className="mt-1.5 text-[10.5px] text-brand-inkFaint">
          Answers come from your own permissions. This conversation isn&rsquo;t saved.
        </p>
      </div>
    </div>
  );
}
