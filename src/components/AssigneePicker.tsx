"use client";

import { useState, useRef, useEffect } from "react";

/**
 * Multi-select for task assignees. Shows selected people as removable chips
 * with a dropdown to add more — clearer than a multi-select box, and it makes
 * "who is on this" obvious at a glance.
 */
export default function AssigneePicker({
  teamMembers,
  selected,
  onChange,
  compact = false,
}: {
  teamMembers: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const chosen = teamMembers.filter((m) => selected.includes(m.id));
  const available = teamMembers.filter((m) => !selected.includes(m.id));

  function add(id: string) {
    onChange([...selected, id]);
    setOpen(false);
  }
  function remove(id: string) {
    onChange(selected.filter((x) => x !== id));
  }

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex flex-wrap items-center gap-1 rounded-md border border-brand-line bg-white ${
          compact ? "px-1.5 py-1 min-h-[30px]" : "px-2 py-1.5 min-h-[38px]"
        }`}
      >
        {chosen.length === 0 && (
          <span className={`text-brand-inkFaint italic ${compact ? "text-[11px]" : "text-sm"}`}>
            No one assigned
          </span>
        )}
        {chosen.map((m) => (
          <span
            key={m.id}
            className={`inline-flex items-center gap-1 rounded bg-brand-greenTint text-brand-greenDark font-semibold ${
              compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
            }`}
          >
            {m.name}
            <button
              type="button"
              onClick={() => remove(m.id)}
              className="text-brand-inkFaint hover:text-red-600 leading-none"
              title={`Remove ${m.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {available.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={`text-brand-greenDark font-semibold hover:underline ${compact ? "text-[10px]" : "text-xs"}`}
          >
            + Add
          </button>
        )}
      </div>

      {open && available.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-52 overflow-auto bg-white border border-brand-line rounded-md shadow-lg">
          {available.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => add(m.id)}
              className="w-full text-left px-3 py-1.5 text-xs text-brand-inkSoft hover:bg-brand-greenTint border-b border-brand-line last:border-0"
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
