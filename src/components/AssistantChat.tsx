"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { askAssistantAction, deleteChatThread } from "@/lib/actions";

export type ChatMsg = { id: string; role: string; content: string; createdAt: string };
export type Thread = { id: string; title: string; updatedAt: string; messages: ChatMsg[] };

const SUGGESTIONS = [
  "What needs my attention today?",
  "Which projects are over budget?",
  "Summarise the Mead data center project",
  "What did we decide in the last meeting?",
];

export default function AssistantChat({
  threads, activeThread, memberName, configured,
}: {
  threads: Thread[];
  activeThread: Thread | null;
  memberName: string;
  configured: boolean;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>(activeThread?.messages ?? []);
  const [threadId, setThreadId] = useState<string | null>(activeThread?.id ?? null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  function send(text: string) {
    const q = text.trim();
    if (!q || isPending) return;
    setError(null);
    setInput("");

    // Show the question immediately — waiting for a round trip to see your own
    // words feels broken.
    const optimistic: ChatMsg = { id: `tmp-${Date.now()}`, role: "user", content: q, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);

    startTransition(async () => {
      try {
        const res = await askAssistantAction(threadId, q);
        setThreadId(res.threadId);
        setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: res.answer!, createdAt: new Date().toISOString() }]);
      } catch (e: any) {
        setError(e?.message || "Something went wrong.");
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        setInput(q); // give the question back rather than losing it
      }
    });
  }

  if (!configured) {
    return (
      <div className="rounded-md bg-orange-50 border border-orange-200 p-4">
        <p className="text-sm font-semibold text-brand-amber">The assistant isn&rsquo;t configured</p>
        <p className="text-xs text-brand-inkSoft mt-1">
          Add <code>DEEPSEEK_API_KEY</code> in Vercel and redeploy.
        </p>
      </div>
    );
  }

  return (
    <div className="lg:flex gap-4 items-start">
      {threads.length > 0 && (
        <aside className="hidden lg:block w-52 shrink-0">
          <p className="kicker mb-2">Conversations</p>
          <div className="space-y-1">
            <button
              onClick={() => { setThreadId(null); setMessages([]); setError(null); }}
              className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors ${
                !threadId ? "bg-brand-greenTint text-brand-ink font-medium" : "text-brand-inkSoft hover:bg-brand-greenTint/50"
              }`}
            >
              + New conversation
            </button>
            {threads.map((t) => (
              <a
                key={t.id}
                href={`/assistant?t=${t.id}`}
                className={`block px-2.5 py-1.5 rounded text-xs truncate transition-colors ${
                  threadId === t.id ? "bg-brand-greenTint text-brand-ink font-medium" : "text-brand-inkSoft hover:bg-brand-greenTint/50"
                }`}
                title={t.title}
              >
                {t.title}
              </a>
            ))}
          </div>
        </aside>
      )}

      <div className="flex-1 min-w-0">
        <div className="bg-white border border-brand-line rounded-md flex flex-col" style={{ minHeight: "460px" }}>
          <div className="flex-1 p-4 space-y-4 overflow-y-auto" style={{ maxHeight: "62vh" }}>
            {messages.length === 0 && (
              <div className="py-8 text-center">
                <p className="font-heading font-extrabold text-[17px] text-brand-ink">
                  Ask me about your projects, {memberName.split(" ")[0]}
                </p>
                <p className="text-xs text-brand-inkFaint mt-1 mb-4">
                  I can see the projects you have access to — budgets, tasks, meetings and trade shows.
                  I can also help with anything else.
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-[11px] px-2.5 py-1.5 rounded-full border border-brand-line text-brand-inkSoft hover:border-brand-green hover:text-brand-greenDark transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                <div
                  className={`max-w-[85%] rounded-md px-3 py-2 ${
                    m.role === "user" ? "bg-brand-green text-white" : "bg-brand-greenTint"
                  }`}
                >
                  <p className={`text-[13px] leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "text-white" : "text-brand-inkSoft"}`}>
                    {m.content}
                  </p>
                </div>
              </div>
            ))}

            {isPending && (
              <div className="flex items-center gap-2 text-brand-inkFaint">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
                <span className="text-xs">Thinking…</span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {error && <p className="px-4 pb-2 text-xs text-red-600">{error}</p>}

          <div className="border-t border-brand-line p-3 flex gap-2">
            <input
              className="input !py-2 text-sm flex-1"
              placeholder="Ask anything…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              disabled={isPending}
            />
            <button onClick={() => send(input)} disabled={isPending || !input.trim()} className="btn-primary text-sm !px-4">
              Send
            </button>
          </div>
        </div>

        <p className="text-[10px] text-brand-inkFaint mt-2">
          The assistant only sees projects you have access to. Double-check anything important before acting on it.
        </p>
      </div>
    </div>
  );
}
