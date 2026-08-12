"use client";

import { useState, useTransition } from "react";
import { createTeamMember } from "@/lib/actions";

export default function AddMemberForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      await createTeamMember({ name, title, email, phone });
      setName("");
      setTitle("");
      setEmail("");
      setPhone("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        + Add Team Member
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 bg-white grid sm:grid-cols-5 gap-2 items-end">
      <div>
        <label className="label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div>
        <label className="label">Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="label">Email</label>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label">Phone</label>
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="btn-primary flex-1">
          {isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-5">{error}</p>}
    </form>
  );
}
