"use client";

import { useState, useTransition, useEffect } from "react";
import { saveTradeShow } from "@/lib/actions";
import type { TradeShowItem } from "./TradeShowCard";

const BLANK = {
  name: "", description: "", startDate: "", endDate: "", timeInfo: "",
  venue: "", city: "", state: "", country: "USA",
  websiteUrl: "", registrationUrl: "", registrationDeadline: "",
  priority: "Medium", status: "Considering", boothInfo: "", estimatedCost: 0, notes: "",
};

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export default function TradeShowForm({
  editing,
  onClose,
}: {
  editing: TradeShowItem | null;
  onClose: () => void;
}) {
  const [f, setF] = useState({ ...BLANK });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (editing) {
      setF({
        name: editing.name,
        description: editing.description || "",
        startDate: toDateInput(editing.startDate),
        endDate: toDateInput(editing.endDate),
        timeInfo: editing.timeInfo || "",
        venue: editing.venue || "",
        city: editing.city || "",
        state: editing.state || "",
        country: editing.country || "USA",
        websiteUrl: editing.websiteUrl || "",
        registrationUrl: editing.registrationUrl || "",
        registrationDeadline: toDateInput(editing.registrationDeadline),
        priority: editing.priority,
        status: editing.status,
        boothInfo: editing.boothInfo || "",
        estimatedCost: editing.estimatedCost,
        notes: editing.notes || "",
      });
    } else {
      setF({ ...BLANK });
    }
  }, [editing]);

  function set(patch: Partial<typeof BLANK>) {
    setF((p) => ({ ...p, ...patch }));
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await saveTradeShow(editing?.id ?? null, {
          ...f,
          endDate: f.endDate || null,
          registrationDeadline: f.registrationDeadline || null,
          estimatedCost: Number(f.estimatedCost) || 0,
        });
        onClose();
      } catch (err: any) {
        setError(err?.message || "Couldn't save.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="card p-5 bg-white space-y-4">
      <p className="kicker">{editing ? "Edit Trade Show" : "Add Trade Show"}</p>

      <div>
        <label className="label">Show Name</label>
        <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="RE+ 2026" autoFocus />
      </div>

      <div>
        <label className="label">About</label>
        <textarea className="input" rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="What it is and why it matters to us" />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Start Date</label>
          <input type="date" className="input" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </div>
        <div>
          <label className="label">End Date</label>
          <input type="date" className="input" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
        </div>
        <div>
          <label className="label">Hours / Times</label>
          <input className="input" value={f.timeInfo} onChange={(e) => set({ timeInfo: e.target.value })} placeholder="Expo 9am–5pm daily" />
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2">
          <label className="label">Venue</label>
          <input className="input" value={f.venue} onChange={(e) => set({ venue: e.target.value })} placeholder="Anaheim Convention Center" />
        </div>
        <div>
          <label className="label">City</label>
          <input className="input" value={f.city} onChange={(e) => set({ city: e.target.value })} />
        </div>
        <div>
          <label className="label">State</label>
          <input className="input" value={f.state} onChange={(e) => set({ state: e.target.value })} />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Priority</label>
          <select className="input" value={f.priority} onChange={(e) => set({ priority: e.target.value })}>
            {["High", "Medium", "Low"].map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={f.status} onChange={(e) => set({ status: e.target.value })}>
            {["Considering", "Registered", "Attending", "Attended", "Skipped"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Register By</label>
          <input type="date" className="input" value={f.registrationDeadline} onChange={(e) => set({ registrationDeadline: e.target.value })} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Show Website</label>
          <input className="input" value={f.websiteUrl} onChange={(e) => set({ websiteUrl: e.target.value })} placeholder="https://…" />
        </div>
        <div>
          <label className="label">Registration Link</label>
          <input className="input" value={f.registrationUrl} onChange={(e) => set({ registrationUrl: e.target.value })} placeholder="https://…" />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Booth Info</label>
          <input className="input" value={f.boothInfo} onChange={(e) => set({ boothInfo: e.target.value })} placeholder="Booth #1423, 10x20" />
        </div>
        <div>
          <label className="label">Estimated Cost ($)</label>
          <input type="number" step="any" className="input" value={f.estimatedCost} onChange={(e) => set({ estimatedCost: Number(e.target.value) })} />
        </div>
      </div>

      <div>
        <label className="label">Internal Notes</label>
        <textarea className="input" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="btn-primary text-sm">
          {isPending ? "Saving…" : editing ? "Save Changes" : "Add Show"}
        </button>
        <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
      </div>
    </form>
  );
}
