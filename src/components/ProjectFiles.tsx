"use client";

import { useTransition } from "react";
import { deleteProjectFile } from "@/lib/actions";
import { isImage, fileKind, fmtBytes } from "@/lib/files";

type FileItem = {
  id: string;
  url: string;
  filename: string;
  contentType: string | null;
  size: number;
  uploadedAt: string | Date;
};

export default function ProjectFiles({ files, canDelete = true }: { files: FileItem[]; canDelete?: boolean }) {
  const [isPending, startTransition] = useTransition();

  function remove(id: string, name: string) {
    if (!confirm(`Remove "${name}"? This can't be undone.`)) return;
    startTransition(() => deleteProjectFile(id));
  }

  if (files.length === 0) {
    return <p className="text-sm text-brand-inkFaint">No files uploaded yet.</p>;
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {files.map((f) => {
        const kind = fileKind(f.contentType, f.filename);
        // Everything is served through our own authenticated proxy — files
        // live in private blob storage, so there's no raw URL that works on
        // its own. Viewing (no query param) renders inline in-browser, which
        // for PDFs and images means the browser's native viewer — printable
        // with Ctrl+P without ever leaving the site.
        const viewUrl = `/api/files/${f.id}`;
        const downloadUrl = `/api/files/${f.id}?download=1`;
        return (
          <div key={f.id} className="border border-brand-line rounded-md p-3 flex items-center gap-3 bg-white">
            {isImage(f.contentType) ? (
              <a href={viewUrl} target="_blank" rel="noreferrer" className="shrink-0">
                <img src={viewUrl} alt={f.filename} className="w-12 h-12 object-cover rounded border border-brand-line" />
              </a>
            ) : (
              <a href={viewUrl} target="_blank" rel="noreferrer" className="shrink-0">
                <div
                  className="w-12 h-12 rounded flex items-center justify-center text-white text-[10px] font-mono font-bold"
                  style={{ backgroundColor: kind.color }}
                >
                  {kind.label}
                </div>
              </a>
            )}
            <div className="min-w-0 flex-1">
              <a
                href={viewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-brand-ink hover:text-brand-greenDark truncate block"
                title={`View ${f.filename}`}
              >
                {f.filename}
              </a>
              <div className="flex items-center gap-2">
                <p className="text-xs text-brand-inkFaint">{fmtBytes(f.size)}</p>
                <a href={downloadUrl} className="text-xs text-brand-greenDark hover:underline" title="Download">
                  Download
                </a>
              </div>
            </div>
            {canDelete && (
              <button
                onClick={() => remove(f.id, f.filename)}
                disabled={isPending}
                className="shrink-0 w-7 h-7 rounded-md border border-brand-line text-brand-inkFaint hover:text-red-600 hover:border-red-200 flex items-center justify-center"
                title="Remove"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
