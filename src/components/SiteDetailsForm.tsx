"use client";

import { useState, useTransition } from "react";
import { updateProjectSite, lookupCoordinates } from "@/lib/actions";
import ProjectMap from "./ProjectMap";

type Site = {
  address: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  ownerName: string;
  ownerCompany: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerNotes: string;
};

export default function SiteDetailsForm({
  projectId,
  initial,
  canEdit,
}: {
  projectId: string;
  initial: Site;
  canEdit: boolean;
}) {
  const [s, setS] = useState<Site>(initial);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [geocoding, setGeocoding] = useState(false);

  function set(patch: Partial<Site>) {
    setS((p) => ({ ...p, ...patch }));
    setMsg(null);
  }

  const fullAddress = [s.address, s.city, s.state, s.postalCode].filter(Boolean).join(", ");

  async function findCoords() {
    if (!fullAddress.trim()) {
      setMsg({ type: "err", text: "Enter an address first." });
      return;
    }
    setGeocoding(true);
    setMsg(null);
    try {
      const res = await lookupCoordinates(fullAddress);
      if (!res) {
        setMsg({ type: "err", text: "Couldn't find that address. Try adding city and state, or enter coordinates manually." });
      } else {
        set({
          latitude: res.latitude,
          longitude: res.longitude,
          city: s.city || res.city || "",
          state: s.state || res.state || "",
          postalCode: s.postalCode || res.postalCode || "",
        });
        setMsg({ type: "ok", text: `Found: ${res.displayName.slice(0, 90)}` });
      }
    } catch {
      setMsg({ type: "err", text: "Lookup service unavailable. You can enter coordinates manually." });
    } finally {
      setGeocoding(false);
    }
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      try {
        await updateProjectSite(projectId, s);
        setMsg({ type: "ok", text: "Site details saved." });
      } catch (e: any) {
        setMsg({ type: "err", text: e?.message || "Couldn't save." });
      }
    });
  }

  if (!canEdit) {
    return (
      <div className="space-y-4">
        <ProjectMap latitude={s.latitude} longitude={s.longitude} address={fullAddress} />
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <Read label="Address" value={fullAddress} />
          <Read label="Owner" value={[s.ownerName, s.ownerCompany].filter(Boolean).join(" · ")} />
          <Read label="Owner Email" value={s.ownerEmail} href={s.ownerEmail ? `mailto:${s.ownerEmail}` : undefined} />
          <Read label="Owner Phone" value={s.ownerPhone} href={s.ownerPhone ? `tel:${s.ownerPhone}` : undefined} />
        </div>
        {s.ownerNotes && <p className="text-sm italic text-brand-inkSoft">{s.ownerNotes}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ProjectMap latitude={s.latitude} longitude={s.longitude} address={fullAddress} />

      <div>
        <p className="kicker mb-2">Site Location</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label">Street Address</label>
            <input className="input" value={s.address} onChange={(e) => set({ address: e.target.value })} placeholder="8460 US 70" />
          </div>
          <div>
            <label className="label">City</label>
            <input className="input" value={s.city} onChange={(e) => set({ city: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">State</label>
              <input className="input" maxLength={2} value={s.state} onChange={(e) => set({ state: e.target.value.toUpperCase() })} placeholder="OK" />
            </div>
            <div>
              <label className="label">ZIP</label>
              <input className="input" value={s.postalCode} onChange={(e) => set({ postalCode: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Latitude</label>
            <input type="number" step="any" className="input" value={s.latitude ?? ""} onChange={(e) => set({ latitude: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Longitude</label>
            <input type="number" step="any" className="input" value={s.longitude ?? ""} onChange={(e) => set({ longitude: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
        </div>
        <button onClick={findCoords} disabled={geocoding} className="btn-secondary text-xs mt-3">
          {geocoding ? "Searching…" : "📍 Find coordinates from address"}
        </button>
        <p className="text-[11px] text-brand-inkFaint mt-1">
          Uses OpenStreetMap — free, no API key. Always eyeball the pin before relying on it.
        </p>
      </div>

      <div>
        <p className="kicker mb-2">Project Owner / Client</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Owner Name</label>
            <input className="input" value={s.ownerName} onChange={(e) => set({ ownerName: e.target.value })} />
          </div>
          <div>
            <label className="label">Company</label>
            <input className="input" value={s.ownerCompany} onChange={(e) => set({ ownerCompany: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={s.ownerEmail} onChange={(e) => set({ ownerEmail: e.target.value })} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={s.ownerPhone} onChange={(e) => set({ ownerPhone: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={s.ownerNotes} onChange={(e) => set({ ownerNotes: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={save} disabled={isPending} className="btn-primary text-xs">
          {isPending ? "Saving…" : "Save Site Details"}
        </button>
        {msg && (
          <span className={`text-xs ${msg.type === "err" ? "text-red-600" : "text-brand-greenDark"}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

function Read({ label, value, href }: { label: string; value?: string; href?: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-bold tracking-widest text-brand-greenDark uppercase">{label}</p>
      {value ? (
        href ? (
          <a href={href} className="text-brand-ink hover:text-brand-greenDark hover:underline">{value}</a>
        ) : (
          <p className="text-brand-ink">{value}</p>
        )
      ) : (
        <p className="text-brand-inkFaint italic text-sm">—</p>
      )}
    </div>
  );
}
