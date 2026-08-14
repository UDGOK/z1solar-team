"use client";

import { useState, useTransition } from "react";
import { saveCategory, deleteCategory } from "@/lib/actions";

export type CatItem = { id: string; name: string; color: string; order: number; projectCount: number };

const SWATCHES = ["#4CAB3E", "#3F9634", "#E8743B", "#C0392B", "#1C1C1C", "#8A8A85"];

export default function CategoryManager({ categories }: { categories: CatItem[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [reassign, setReassign] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function start(c: CatItem) {
    setEditingId(c.id);
    setName(c.name);
    setColor(c.color);
    setCreating(false);
    setError(null);
  }

  function save(id: string | null, order: number) {
    setError(null);
    startTransition(async () => {
      try {
        await saveCategory(id, { name, color, order });
        setEditingId(null);
        setCreating(false);
        setName("");
      } catch (e: any) {
        setError(e?.message || "Couldn't save.");
      }
    });
  }

  function remove(c: CatItem) {
    setError(null);
    const target = reassign[c.id];
    if (c.projectCount > 0 && !target) {
      setError(`Choose where to move ${c.projectCount} project${c.projectCount === 1 ? "" : "s"} first.`);
      return;
    }
    const msg = c.projectCount
      ? `Delete "${c.name}" and move ${c.projectCount} project(s) to another category?`
      : `Delete the empty category "${c.name}"?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      try {
        await deleteCategory(c.id, target);
      } catch (e: any) {
        setError(e?.message || "Couldn't delete.");
      }
    });
  }

  return (
    <div className="card p-5 bg-white">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <p className="kicker">Project Categories</p>
          <p className="text-xs text-brand-inkFaint">
            Renaming moves every project in that category at the same time — nothing gets orphaned.
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => { setCreating(true); setEditingId(null); setName(""); setColor(SWATCHES[0]); }}
            className="btn-primary text-xs"
          >
            + New category
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {creating && (
        <div className="border border-brand-green rounded-md p-3 mb-3 space-y-2">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" autoFocus />
          <div className="flex gap-1.5">
            {SWATCHES.map((s) => (
              <button
                key={s}
                onClick={() => setColor(s)}
                className={`w-6 h-6 rounded ${color === s ? "ring-2 ring-offset-1 ring-brand-ink" : ""}`}
                style={{ backgroundColor: s }}
                aria-label={`Colour ${s}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => save(null, categories.length)} disabled={isPending} className="btn-primary text-xs">
              {isPending ? "Saving…" : "Create"}
            </button>
            <button onClick={() => setCreating(false)} className="btn-secondary text-xs">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {categories.map((c) => (
          <div key={c.id} className="border border-brand-line rounded-md p-3">
            {editingId === c.id ? (
              <div className="space-y-2">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                <div className="flex gap-1.5">
                  {SWATCHES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setColor(s)}
                      className={`w-6 h-6 rounded ${color === s ? "ring-2 ring-offset-1 ring-brand-ink" : ""}`}
                      style={{ backgroundColor: s }}
                      aria-label={`Colour ${s}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => save(c.id, c.order)} disabled={isPending} className="btn-primary text-xs">
                    {isPending ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setEditingId(null)} className="btn-secondary text-xs">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
                <span className="font-semibold text-sm text-brand-ink">{c.name}</span>
                <span className="text-[11px] text-brand-inkFaint">
                  {c.projectCount} project{c.projectCount === 1 ? "" : "s"}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {c.projectCount > 0 && (
                    <select
                      className="input !py-1 text-[11px] !w-auto"
                      value={reassign[c.id] ?? ""}
                      onChange={(e) => setReassign({ ...reassign, [c.id]: e.target.value })}
                    >
                      <option value="">Move projects to…</option>
                      {categories.filter((x) => x.id !== c.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </select>
                  )}
                  <button onClick={() => start(c)} className="btn-secondary !px-2 !py-1 text-[11px]">Rename</button>
                  <button onClick={() => remove(c)} disabled={isPending} className="btn-danger !px-2 !py-1 text-[11px]">Delete</button>
                </span>
              </div>
            )}
          </div>
        ))}
        {categories.length === 0 && <p className="text-sm text-brand-inkFaint">No categories yet.</p>}
      </div>
    </div>
  );
}
