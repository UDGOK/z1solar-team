"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createVendorTag,
  renameVendorTag,
  deleteVendorTag,
  reorderVendorTags,
} from "@/lib/exhibitors/actions";

export type TagItem = { id: string; name: string; vendorCount: number };

/**
 * Vendor tag management.
 *
 * Mirrors the project-category manager deliberately: same reassign-before-delete
 * rule, same inline rename. A tag carrying companies cannot simply be deleted —
 * you must say where those companies go — because silently untagging 150
 * vendors is invisible until someone notices the filter is wrong months later.
 */
export default function VendorTagManager({ items }: { items: TagItem[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function run(fn: () => Promise<unknown>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        after?.();
        router.refresh();
      } catch (e: any) {
        setError(e?.message ?? "Something went wrong.");
      }
    });
  }

  const move = (id: string, dir: -1 | 1) => {
    const idx = items.findIndex((t) => t.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= items.length) return;
    const order = items.map((t) => t.id);
    [order[idx], order[swap]] = [order[swap], order[idx]];
    run(() => reorderVendorTags(order));
  };

  const inUse = items.filter((t) => t.vendorCount > 0).length;
  const total = items.reduce((n, t) => n + t.vendorCount, 0);

  return (
    <div>
      <div className="mb-1 text-xs text-brand-inkFaint">
        <Link href="/settings" className="hover:text-brand-greenDark">
          Settings
        </Link>{" "}
        &rarr; Vendor tags
      </div>
      <p className="kicker mb-1">[ Z1POWER ]</p>
      <h1 className="font-heading text-3xl font-extrabold text-brand-ink">Vendor Tags</h1>
      <p className="mb-6 mt-1 text-sm text-brand-inkSoft">
        What exhibitors and vendors do, used to filter a show&rsquo;s company list. Renaming a tag
        updates it everywhere at once.
      </p>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2.5">
        {[
          { n: items.length, l: "Tags" },
          { n: inUse, l: "In use" },
          { n: total, l: "Tagged companies" },
        ].map((x) => (
          <div key={x.l} className="card min-w-[120px] px-4 py-2.5">
            <div className="font-heading text-2xl font-extrabold leading-tight">{x.n}</div>
            <div className="tag mt-0.5 text-brand-inkFaint">{x.l}</div>
          </div>
        ))}
      </div>

      <div className="card mb-5 p-4">
        <p className="kicker mb-2">[ Add a tag ]</p>
        <div className="flex gap-2">
          <input
            className="input max-w-xs"
            placeholder="e.g. Fire Suppression"
            value={newName}
            disabled={busy}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                run(() => createVendorTag(newName), () => setNewName(""));
              }
            }}
          />
          <button
            className="btn-primary"
            disabled={busy || !newName.trim()}
            onClick={() => run(() => createVendorTag(newName), () => setNewName(""))}
          >
            Add tag
          </button>
        </div>
        <p className="mt-2 text-xs text-brand-inkFaint">
          Names are case-insensitive &mdash; &ldquo;BESS&rdquo; and &ldquo;bess&rdquo; are the same
          tag, so you can&rsquo;t create both by accident.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="tag border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint">
                Tag
              </th>
              <th className="tag w-[150px] border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint">
                Companies
              </th>
              <th className="tag w-[210px] border-b border-brand-line px-3 py-2 text-left text-brand-inkFaint">
                Order
              </th>
              <th className="tag w-[170px] border-b border-brand-line px-3 py-2 text-right text-brand-inkFaint">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((t, i) => (
              <>
                <tr key={t.id} className="border-b border-[#EEEEEA]">
                  <td className="px-3 py-3">
                    {editingId === t.id ? (
                      <div className="flex gap-2">
                        <input
                          className="input max-w-xs"
                          value={editName}
                          autoFocus
                          disabled={busy}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              run(() => renameVendorTag(t.id, editName), () => setEditingId(null));
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <button
                          className="btn-primary text-xs"
                          disabled={busy}
                          onClick={() => run(() => renameVendorTag(t.id, editName), () => setEditingId(null))}
                        >
                          Save
                        </button>
                        <button className="btn-secondary text-xs" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex rounded border border-[#cfe3ca] bg-brand-greenTint px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-brand-greenDark">
                        {t.name}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-brand-inkSoft">
                    {t.vendorCount > 0 ? t.vendorCount : <span className="text-brand-inkFaint">&mdash;</span>}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      className="btn-secondary mr-1 px-2 py-1 text-xs"
                      disabled={busy || i === 0}
                      onClick={() => move(t.id, -1)}
                      aria-label="Move up"
                    >
                      &uarr;
                    </button>
                    <button
                      className="btn-secondary px-2 py-1 text-xs"
                      disabled={busy || i === items.length - 1}
                      onClick={() => move(t.id, 1)}
                      aria-label="Move down"
                    >
                      &darr;
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      className="btn-secondary mr-1 text-xs"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(t.id);
                        setEditName(t.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      className="btn-danger text-xs"
                      disabled={busy}
                      onClick={() => {
                        setDeletingId(deletingId === t.id ? null : t.id);
                        setReassignTo("");
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>

                {deletingId === t.id && (
                  <tr key={`${t.id}-del`} className="border-b border-[#EEEEEA] bg-[#FFF8F8]">
                    <td colSpan={4} className="px-3 py-3">
                      {t.vendorCount === 0 ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-sm text-brand-inkSoft">
                            Nothing is using &ldquo;{t.name}&rdquo;. Delete it?
                          </span>
                          <button
                            className="btn-danger text-xs"
                            disabled={busy}
                            onClick={() => run(() => deleteVendorTag(t.id, null), () => setDeletingId(null))}
                          >
                            Yes, delete
                          </button>
                          <button className="btn-secondary text-xs" onClick={() => setDeletingId(null)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div>
                          <p className="mb-2 text-sm text-brand-inkSoft">
                            <b>{t.vendorCount}</b>{" "}
                            {t.vendorCount === 1 ? "company carries" : "companies carry"} &ldquo;
                            {t.name}&rdquo;. Choose where they move to &mdash; they can&rsquo;t just
                            be left untagged.
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              className="input max-w-xs"
                              value={reassignTo}
                              onChange={(e) => setReassignTo(e.target.value)}
                            >
                              <option value="">&mdash; choose a tag &mdash;</option>
                              {items
                                .filter((o) => o.id !== t.id)
                                .map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.name}
                                  </option>
                                ))}
                            </select>
                            <button
                              className="btn-danger text-xs"
                              disabled={busy || !reassignTo}
                              onClick={() =>
                                run(() => deleteVendorTag(t.id, reassignTo), () => setDeletingId(null))
                              }
                            >
                              Move and delete
                            </button>
                            <button className="btn-secondary text-xs" onClick={() => setDeletingId(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}

            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-sm text-brand-inkFaint">
                  No tags yet. Add one above, or run <code>npm run db:seed</code> for the starter set.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
