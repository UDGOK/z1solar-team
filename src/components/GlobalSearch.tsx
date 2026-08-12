"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { globalSearch, type SearchHit } from "@/lib/actions";

const TYPE_META: Record<string, { label: string; color: string }> = {
  project: { label: "PROJECT", color: "#4CAB3E" },
  task: { label: "TASK", color: "#3F9634" },
  file: { label: "FILE", color: "#E8743B" },
  person: { label: "PERSON", color: "#8A8A85" },
};

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K opens it from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40);
    else {
      setQ("");
      setHits([]);
      setActive(0);
    }
  }, [open]);

  // Debounced so typing doesn't fire a query per keystroke.
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        try {
          const res = await globalSearch(q);
          setHits(res);
          setActive(0);
        } catch {
          setHits([]);
        }
      });
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  function go(hit: SearchHit) {
    setOpen(false);
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-brand-line bg-white text-brand-inkFaint hover:border-brand-green transition-colors"
        title="Search (Ctrl+K)"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <span className="hidden md:inline text-xs">Search</span>
        <kbd className="hidden md:inline text-[9px] font-mono px-1 py-0.5 rounded bg-brand-greenTint border border-brand-line">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xl bg-white rounded-lg shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-brand-line">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A8A85" strokeWidth="2.5">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search projects, tasks, files, people…"
                className="flex-1 text-sm outline-none text-brand-ink placeholder:text-brand-inkFaint"
              />
              {isPending && <span className="text-[10px] font-mono text-brand-inkFaint">…</span>}
            </div>

            <div className="max-h-[55vh] overflow-auto">
              {q.trim().length < 2 ? (
                <p className="px-4 py-6 text-center text-xs text-brand-inkFaint">
                  Type at least 2 characters. Try a project name, task, filename, or person.
                </p>
              ) : hits.length === 0 && !isPending ? (
                <p className="px-4 py-6 text-center text-sm text-brand-inkSoft">
                  Nothing found for &ldquo;{q}&rdquo;
                </p>
              ) : (
                hits.map((h, i) => {
                  const meta = TYPE_META[h.type];
                  return (
                    <button
                      key={`${h.type}-${h.id}`}
                      onClick={() => go(h)}
                      onMouseEnter={() => setActive(i)}
                      className={`w-full text-left px-4 py-2.5 border-b border-brand-line last:border-0 flex items-start gap-3 ${
                        i === active ? "bg-brand-greenTint" : "hover:bg-brand-greenTint/50"
                      }`}
                    >
                      <span
                        className="mt-0.5 shrink-0 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold text-white tracking-wider"
                        style={{ backgroundColor: meta.color }}
                      >
                        {meta.label}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-brand-ink truncate">{h.title}</span>
                        <span className="block text-[11px] text-brand-inkFaint truncate">{h.subtitle}</span>
                      </span>
                      {h.badge && (
                        <span className="shrink-0 text-[10px] font-mono text-brand-inkFaint">{h.badge}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-4 py-2 border-t border-brand-line bg-brand-greenTint flex gap-3 text-[10px] text-brand-inkFaint">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
