"use client";

import { useTransition } from "react";

export default function ToggleCheckbox({
  id,
  checked,
  onToggle,
  label,
  strikethrough = true,
}: {
  id: string;
  checked: boolean;
  onToggle: (id: string, next: boolean) => Promise<void>;
  label: string;
  strikethrough?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <label className="flex items-start gap-2 cursor-pointer select-none py-1">
      <input
        type="checkbox"
        checked={checked}
        disabled={isPending}
        onChange={(e) => startTransition(() => onToggle(id, e.target.checked))}
        className="w-4 h-4 mt-0.5 accent-[#4CAB3E]"
      />
      <span
        className={`text-sm ${checked && strikethrough ? "line-through text-brand-inkFaint" : "text-brand-inkSoft"}`}
      >
        {label}
      </span>
    </label>
  );
}
