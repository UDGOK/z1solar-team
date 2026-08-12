"use client";

import { useEffect, useState, useTransition } from "react";
import { generateShareableSummaryLink } from "@/lib/actions";

export default function ShareSummary({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  function handleGenerateLink() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await generateShareableSummaryLink(projectId);
        setLink(res.url);
      } catch (err: any) {
        setError(err?.message || "Couldn't generate the link.");
      }
    });
  }

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const shareText = `${projectTitle} — Z1Power Project Summary`;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2 flex-wrap justify-end">
        <a href={`/api/projects/${projectId}/summary`} className="btn-secondary text-xs" download>
          ↓ Download PDF
        </a>
        {!link && (
          <button onClick={handleGenerateLink} disabled={isPending} className="btn-primary text-xs">
            {isPending ? "Generating…" : "Get Shareable Link"}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {link && (
        <div className="border border-brand-line rounded-md p-3 bg-brand-greenTint w-full max-w-sm">
          <p className="text-[11px] text-brand-inkFaint italic mb-2">
            Public link — anyone with it can view this PDF, no login required.
          </p>
          <div className="flex gap-2 mb-2">
            <input readOnly value={link} className="input text-xs flex-1" onFocus={(e) => e.target.select()} />
            <button onClick={copyLink} className="btn-secondary text-xs shrink-0">
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a
              href={`mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(shareText + "\n\n" + link)}`}
              className="btn-secondary text-xs"
            >
              ✉ Email
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText + " " + link)}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-xs"
            >
              WhatsApp
            </a>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-xs"
            >
              LinkedIn
            </a>
            {canNativeShare && (
              <button
                onClick={() => (navigator as any).share({ title: shareText, url: link })}
                className="btn-secondary text-xs"
              >
                Other…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
