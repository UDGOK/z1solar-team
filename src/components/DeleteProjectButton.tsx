"use client";

import { useTransition } from "react";
import { deleteProject } from "@/lib/actions";

export default function DeleteProjectButton({ id, title }: { id: string; title: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    startTransition(() => deleteProject(id));
  }

  return (
    <button type="button" onClick={handleClick} disabled={isPending} className="btn-danger text-xs">
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
