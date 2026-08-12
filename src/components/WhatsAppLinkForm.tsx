"use client";

import { useState, useTransition } from "react";
import { updateWhatsAppLink } from "@/lib/actions";

export default function WhatsAppLinkForm({ initialLink }: { initialLink: string | null }) {
  const [link, setLink] = useState(initialLink || "");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await updateWhatsAppLink(link);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="card p-5 bg-brand-greenTint border-brand-green">
      <p className="kicker mb-2">Team WhatsApp Group</p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          className="input flex-1"
          placeholder="https://chat.whatsapp.com/…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <button type="submit" disabled={isPending} className="btn-primary shrink-0">
          {isPending ? "Saving…" : saved ? "Saved ✓" : "Save Link"}
        </button>
      </form>
      {initialLink ? (
        <a href={initialLink} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm font-semibold text-brand-greenDark hover:underline">
          Open group →
        </a>
      ) : (
        <p className="mt-3 text-xs text-brand-inkFaint italic">
          Not created yet — paste the invite link here once the group exists (WhatsApp → Group Settings → Invite via Link).
        </p>
      )}
    </div>
  );
}
