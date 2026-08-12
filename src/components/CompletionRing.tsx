const STATUS_COLOR: Record<string, string> = {
  Planning: "#8A8A85",
  "On Track": "#4CAB3E",
  "At Risk": "#E8743B",
  Delayed: "#C0392B",
  Complete: "#3F9634",
};

export default function CompletionRing({ pct, status }: { pct: number; status: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const size = 108;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const color = STATUS_COLOR[status] || "#4CAB3E";

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#EEEEE9" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize="22" fontWeight="800" fill="#1C1C1C">
          {clamped}%
        </text>
      </svg>
      <div>
        <p className="font-mono text-[11px] font-bold tracking-widest text-brand-greenDark uppercase mb-1">Status</p>
        <span
          className="inline-block px-2.5 py-1 rounded text-xs font-mono font-bold tracking-wider text-white"
          style={{ backgroundColor: color }}
        >
          {status.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
