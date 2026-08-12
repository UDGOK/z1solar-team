"use client";

import { useState, useTransition } from "react";
import { updateHighlightTitle } from "@/lib/actions";

export default function EditableHighlightTitle({
  projectId,
  title,
  highlightTitle,
}: {
  projectId: string;
  title: string;
  highlightTitle: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(highlightTitle || "");
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await updateHighlightTitle(projectId, value);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div
        className="flex items-center gap-1"
        onClick={(e) => {
          // The card is wrapped in a Link — stop clicks here from navigating.
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <input
          className="input !py-0.5 !px-1.5 text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={title}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button onClick={save} disabled={isPending} className="btn-primary !px-2 !py-0.5 text-[11px]">
          {isPending ? "…" : "Save"}
        </button>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 group/title">
      <span className="font-heading font-bold text-brand-ink leading-tight">{highlightTitle || title}</span>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEditing(true);
        }}
        title="Rename this highlight"
        className="opacity-0 group-hover/title:opacity-100 group-hover:opacity-100 transition-opacity text-brand-inkFaint hover:text-brand-greenDark text-xs"
      >
        ✎
      </button>
    </span>
  );
}
