/**
 * Shown in place of real financials when the viewer lacks access.
 *
 * The blurred content underneath is deliberately FAKE placeholder numbers —
 * never the real figures. Blurring real data client-side would be security
 * theatre, since anyone could read it from the page source or by disabling
 * CSS. The real values are never sent to the browser at all.
 */
export default function FinancialsLocked() {
  const fake = ["$•••,•••", "$•••,•••", "$••,•••", "$•••,•••"];
  const fakeLabels = ["Est. Budget", "Committed", "Spent to Date", "Remaining"];

  return (
    <div className="relative bg-[#F2F7EF] overflow-hidden">
      {/* Decoy layer — blurred placeholders, not real data */}
      <div className="p-5 select-none pointer-events-none blur-[6px] opacity-60" aria-hidden="true">
        <p className="kicker mb-3">Financials &amp; Budget</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {fake.map((v, i) => (
            <div key={i}>
              <p className="font-mono text-[10px] font-bold tracking-widest text-brand-greenDark uppercase">
                {fakeLabels[i]}
              </p>
              <p className="font-heading text-lg font-extrabold text-brand-ink">{v}</p>
            </div>
          ))}
        </div>
        <div className="w-full h-3 bg-white border border-brand-line rounded-full overflow-hidden">
          <div className="h-full bg-brand-green" style={{ width: "62%" }} />
        </div>
        <div className="space-y-1.5 mt-4">
          {[70, 45, 85, 30].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-16 h-3 bg-white/70 rounded" />
              <div className="flex-1 h-4 bg-white border border-brand-line rounded overflow-hidden">
                <div className="h-full bg-brand-greenDark" style={{ width: `${w}%` }} />
              </div>
              <span className="w-20 h-3 bg-white/70 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-[2px]">
        <div className="text-center px-6 py-5 rounded-lg bg-white/95 border-2 border-dashed border-brand-greenDark shadow-sm max-w-sm mx-4">
          <div className="w-11 h-11 mx-auto mb-3 rounded-full bg-brand-ink flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5">
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <p className="font-mono text-[10px] font-bold tracking-widest text-brand-greenDark uppercase mb-1">
            Restricted Section
          </p>
          <p className="font-heading text-base font-extrabold text-brand-ink mb-1">This area is locked by admin</p>
          <p className="text-xs text-brand-inkSoft">
            Financial details for this project aren&rsquo;t available on your account. Contact an admin if you need
            access.
          </p>
        </div>
      </div>
    </div>
  );
}
