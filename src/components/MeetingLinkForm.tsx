"use client";

import { useState, useTransition } from "react";
import { updateMeetingLink } from "@/lib/actions";

export default function MeetingLinkForm({ initialLink }: { initialLink: string | null }) {
  const [link, setLink] = useState(initialLink || "");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await updateMeetingLink(link);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="card p-5 bg-brand-greenTint border-brand-green">
      <p className="kicker mb-2">Weekly Team Meeting</p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          className="input flex-1"
          placeholder="https://teams.microsoft.com/l/meetup-join/…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <button type="submit" disabled={isPending} className="btn-primary shrink-0">
          {isPending ? "Saving…" : saved ? "Saved ✓" : "Save Link"}
        </button>
      </form>
      {initialLink ? (
        <a
          href={initialLink}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-3 text-sm font-semibold text-brand-greenDark hover:underline"
        >
          Open meeting →
        </a>
      ) : (
        <p className="mt-3 text-xs text-brand-inkFaint italic">
          Paste your recurring Teams / Zoom / Meet link here — it'll show as a one-click join button on the Dashboard.
        </p>
      )}
    </div>
  );
}
