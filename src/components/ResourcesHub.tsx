"use client";

import { useState, useTransition } from "react";
import { saveResource, deleteResource, saveResourceCategory, deleteResourceCategory } from "@/lib/actions";
import { upload } from "@vercel/blob/client";

export type ResourceItem = {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  url: string | null;
  filename: string | null;
  size: number;
  tags: string | null;
  uploadedByName: string | null;
  createdAt: string;
};
export type ResourceCat = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  items: ResourceItem[];
};

function fmtSize(b: number) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export default function ResourcesHub({
  categories,
  canManage,
}: {
  categories: ResourceCat[];
  canManage: boolean;
}) {
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [newCat, setNewCat] = useState(false);
  const [catName, setCatName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [r, setR] = useState({ title: "", description: "", kind: "LINK", url: "", tags: "" });

  const q = query.trim().toLowerCase();
  const shown = categories
    .filter((c) => !activeCat || c.id === activeCat)
    .map((c) => ({
      ...c,
      items: q
        ? c.items.filter(
            (i) =>
              i.title.toLowerCase().includes(q) ||
              (i.tags ?? "").toLowerCase().includes(q) ||
              (i.description ?? "").toLowerCase().includes(q)
          )
        : c.items,
    }));

  const total = categories.reduce((n, c) => n + c.items.length, 0);

  function addLink(categoryId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await saveResource(null, { categoryId, ...r, kind: "LINK" });
        setR({ title: "", description: "", kind: "LINK", url: "", tags: "" });
        setAdding(null);
      } catch (e: any) {
        setError(e?.message || "Couldn't save.");
      }
    });
  }

  async function addFiles(categoryId: string, files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const blob = await upload(file.name, file, { access: "private", handleUploadUrl: "/api/upload" });
        await saveResource(null, {
          categoryId,
          title: file.name.replace(/\.[^.]+$/, ""),
          kind: "FILE",
          pathname: blob.pathname,
          filename: file.name,
          contentType: file.type,
          size: file.size,
          tags: r.tags,
        });
      }
      setAdding(null);
      setR({ title: "", description: "", kind: "LINK", url: "", tags: "" });
    } catch (e: any) {
      setError(e?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2 flex-wrap items-center">
        <input
          className="input !py-1.5 text-sm flex-1 min-w-[180px]"
          placeholder="Search resources, tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {canManage && !newCat && (
          <button onClick={() => setNewCat(true)} className="btn-secondary text-xs">+ New category</button>
        )}
      </div>

      {newCat && (
        <div className="card p-4 bg-white flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Category name</label>
            <input className="input" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Case studies" autoFocus />
          </div>
          <button
            onClick={() =>
              startTransition(async () => {
                try {
                  await saveResourceCategory(null, { name: catName, icon: "folder", color: "#4CAB3E", order: categories.length });
                  setCatName("");
                  setNewCat(false);
                } catch (e: any) {
                  setError(e?.message || "Couldn't create.");
                }
              })
            }
            disabled={isPending}
            className="btn-primary text-xs"
          >
            Create
          </button>
          <button onClick={() => { setNewCat(false); setCatName(""); }} className="btn-secondary text-xs">Cancel</button>
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setActiveCat(null)}
          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
            !activeCat ? "bg-brand-ink text-white border-brand-ink" : "bg-white text-brand-inkSoft border-brand-line"
          }`}
        >
          All {total}
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCat(c.id === activeCat ? null : c.id)}
            className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              activeCat === c.id ? "bg-brand-ink text-white border-brand-ink" : "bg-white text-brand-inkSoft border-brand-line"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: c.color }} />
            {c.name} {c.items.length}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {shown.map((c) => (
        <section key={c.id}>
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: c.color }} />
            <h2 className="text-[9.5px] font-semibold tracking-[0.11em] m-0" style={{ color: c.color }}>
              {c.name.toUpperCase()}
            </h2>
            <span className="text-[10px] text-brand-inkFaint">{c.items.length}</span>
            <span className="flex-1 h-px bg-brand-line" />
            {canManage && (
              <>
                <button onClick={() => setAdding(adding === c.id ? null : c.id)} className="text-[11px] text-brand-greenDark hover:underline">
                  + Add
                </button>
                {c.items.length === 0 && (
                  <button
                    onClick={() => {
                      if (confirm(`Delete the "${c.name}" category?`))
                        startTransition(async () => {
                          try { await deleteResourceCategory(c.id); } catch (e: any) { setError(e?.message); }
                        });
                    }}
                    className="text-[11px] text-brand-inkFaint hover:text-red-600"
                  >
                    Delete
                  </button>
                )}
              </>
            )}
          </div>

          {c.description && <p className="text-[11px] text-brand-inkFaint mb-2">{c.description}</p>}

          {adding === c.id && (
            <div className="card p-4 bg-white mb-3 space-y-3">
              <div className="flex gap-2">
                {["LINK", "FILE"].map((k) => (
                  <button
                    key={k}
                    onClick={() => setR({ ...r, kind: k })}
                    className={`text-xs px-3 py-1.5 rounded border ${
                      r.kind === k ? "bg-brand-green text-white border-brand-green" : "bg-white text-brand-inkSoft border-brand-line"
                    }`}
                  >
                    {k === "LINK" ? "Link" : "Upload file"}
                  </button>
                ))}
              </div>
              {r.kind === "LINK" ? (
                <>
                  <div>
                    <label className="label">Title</label>
                    <input className="input" value={r.title} onChange={(e) => setR({ ...r, title: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">URL</label>
                    <input className="input" value={r.url} onChange={(e) => setR({ ...r, url: e.target.value })} placeholder="https://…" />
                  </div>
                  <div>
                    <label className="label">Tags</label>
                    <input className="input" value={r.tags} onChange={(e) => setR({ ...r, tags: e.target.value })} placeholder="solar, pricing" />
                  </div>
                  <button onClick={() => addLink(c.id)} disabled={isPending} className="btn-primary text-xs">
                    {isPending ? "Saving…" : "Add link"}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="label">Tags (applied to all)</label>
                    <input className="input" value={r.tags} onChange={(e) => setR({ ...r, tags: e.target.value })} placeholder="flyer, 2026" />
                  </div>
                  <input type="file" multiple onChange={(e) => addFiles(c.id, e.target.files)} disabled={uploading} className="text-xs" />
                  {uploading && <p className="text-xs text-brand-inkFaint">Uploading…</p>}
                </>
              )}
            </div>
          )}

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {c.items.map((i) => (
              <div key={i.id} className="group bg-white border border-brand-line rounded-md p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span
                    className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded text-white shrink-0"
                    style={{ backgroundColor: i.kind === "LINK" ? "#8A8A85" : c.color }}
                  >
                    {i.kind}
                  </span>
                  {canManage && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove "${i.title}"?`))
                          startTransition(async () => {
                            try { await deleteResource(i.id); } catch (e: any) { setError(e?.message); }
                          });
                      }}
                      className="text-[11px] text-brand-inkFaint hover:text-red-600 opacity-0 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  )}
                </div>
                <a
                  href={i.kind === "LINK" ? i.url ?? "#" : `/api/resources/${i.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-brand-ink hover:text-brand-greenDark block leading-snug"
                >
                  {i.title}
                </a>
                {i.description && <p className="text-[11px] text-brand-inkFaint mt-0.5 line-clamp-2">{i.description}</p>}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {(i.tags ?? "").split(",").filter((t) => t.trim()).map((t) => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-brand-greenTint text-brand-greenDark">{t.trim()}</span>
                  ))}
                  {i.size > 0 && <span className="text-[9px] text-brand-inkFaint ml-auto">{fmtSize(i.size)}</span>}
                </div>
              </div>
            ))}
            {c.items.length === 0 && (
              <p className="text-[11px] text-brand-inkFaint italic col-span-full">Nothing here yet.</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
