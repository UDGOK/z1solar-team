import { fmtMoney } from "@/lib/format";

type Fin = {
  estBudget: number;
  committed: number;
  actualSpend: number;
  q3Proj: number;
  q4Proj: number;
  q1Proj: number;
  q2Proj: number;
  completionPct: number;
};

function pct(n: number, d: number): number | null {
  if (!d) return null;
  return (n / d) * 100;
}

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(1)}%`;
}

export default function FinancialsDetail({ p }: { p: Fin }) {
  const remaining = p.estBudget - p.actualSpend;
  const uncommitted = p.estBudget - p.committed;
  const totalProjected = p.q3Proj + p.q4Proj + p.q1Proj + p.q2Proj;
  const variance = p.estBudget - totalProjected; // + = under budget, − = over
  const utilization = pct(p.actualSpend, p.estBudget);
  const committedPct = pct(p.committed, p.estBudget);

  // Burn vs progress: spending 80% of budget at 20% complete is the signal
  // worth surfacing. Only meaningful once there's a budget and some progress.
  const burnVsProgress =
    p.estBudget > 0 && p.completionPct > 0 && utilization !== null ? utilization - p.completionPct : null;

  // Forecast at completion: if the current burn rate per % of progress holds,
  // what does the project land at? Naive but useful as an early warning.
  const forecastAtCompletion =
    p.completionPct > 0 ? (p.actualSpend / p.completionPct) * 100 : null;
  const forecastVariance = forecastAtCompletion !== null ? p.estBudget - forecastAtCompletion : null;

  const quarters = [
    { label: "Q3 2026", value: p.q3Proj },
    { label: "Q4 2026", value: p.q4Proj },
    { label: "Q1 2027", value: p.q1Proj },
    { label: "Q2 2027", value: p.q2Proj },
  ];
  const maxQ = Math.max(...quarters.map((q) => q.value), 1);

  return (
    <div className="p-5 bg-[#F2F7EF] space-y-6">
      <div className="flex items-center justify-between">
        <p className="kicker">Financials &amp; Budget — Detail</p>
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider text-white bg-brand-amber">
          ADMIN VIEW
        </span>
      </div>

      {/* Headline figures */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Est. Budget" value={fmtMoney(p.estBudget)} />
        <Stat label="Committed" value={fmtMoney(p.committed)} sub={fmtPct(committedPct) + " of budget"} />
        <Stat label="Spent to Date" value={fmtMoney(p.actualSpend)} sub={fmtPct(utilization) + " utilized"} />
        <Stat
          label="Remaining"
          value={fmtMoney(remaining)}
          tone={remaining < 0 ? "bad" : "good"}
          sub={remaining < 0 ? "over budget" : "available"}
        />
      </div>

      {/* Budget utilization bar */}
      {p.estBudget > 0 && (
        <div>
          <div className="flex justify-between text-[11px] font-mono text-brand-inkSoft mb-1">
            <span>BUDGET UTILIZATION</span>
            <span>
              {fmtMoney(p.actualSpend)} / {fmtMoney(p.estBudget)}
            </span>
          </div>
          <div className="w-full h-3 bg-white border border-brand-line rounded-full overflow-hidden flex">
            <div
              className="h-full bg-brand-green"
              style={{ width: `${Math.min(100, utilization || 0)}%` }}
              title="Spent"
            />
            <div
              className="h-full bg-brand-green/30"
              style={{
                width: `${Math.max(0, Math.min(100 - (utilization || 0), ((p.committed - p.actualSpend) / p.estBudget) * 100))}%`,
              }}
              title="Committed but not yet spent"
            />
          </div>
          <div className="flex gap-4 mt-1 text-[10px] text-brand-inkFaint">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-brand-green inline-block" /> Spent
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-brand-green/30 inline-block" /> Committed, unspent
            </span>
            <span className="ml-auto">Uncommitted: {fmtMoney(uncommitted)}</span>
          </div>
        </div>
      )}

      {/* Quarterly projections with inline bars */}
      <div>
        <p className="text-[11px] font-mono font-bold tracking-widest text-brand-greenDark uppercase mb-2">
          Quarterly Projections
        </p>
        <div className="space-y-1.5">
          {quarters.map((q) => (
            <div key={q.label} className="flex items-center gap-3">
              <span className="w-16 text-[11px] font-mono text-brand-inkSoft shrink-0">{q.label}</span>
              <div className="flex-1 h-4 bg-white border border-brand-line rounded overflow-hidden">
                <div className="h-full bg-brand-greenDark" style={{ width: `${(q.value / maxQ) * 100}%` }} />
              </div>
              <span className="w-20 text-right text-xs font-semibold text-brand-ink shrink-0">
                {fmtMoney(q.value)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 pt-2 border-t border-brand-line text-sm">
          <span className="font-mono text-[11px] font-bold tracking-widest text-brand-greenDark uppercase">
            Total Projected
          </span>
          <span className="font-bold">{fmtMoney(totalProjected)}</span>
        </div>
      </div>

      {/* Variance & health signals */}
      <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t border-brand-line">
        <Stat
          label="Budget vs Projected"
          value={fmtMoney(Math.abs(variance))}
          tone={variance < 0 ? "bad" : "good"}
          sub={variance < 0 ? "projected over budget" : "projected under budget"}
        />
        <Stat
          label="Burn vs Progress"
          value={burnVsProgress === null ? "—" : `${burnVsProgress > 0 ? "+" : ""}${burnVsProgress.toFixed(1)}pts`}
          tone={burnVsProgress === null ? "neutral" : burnVsProgress > 10 ? "bad" : "good"}
          sub={
            burnVsProgress === null
              ? "needs budget + progress"
              : burnVsProgress > 10
              ? "spending ahead of progress"
              : "spend tracking progress"
          }
        />
        <Stat
          label="Forecast at Completion"
          value={forecastAtCompletion === null ? "—" : fmtMoney(forecastAtCompletion)}
          tone={forecastVariance === null ? "neutral" : forecastVariance < 0 ? "bad" : "good"}
          sub={
            forecastAtCompletion === null
              ? "needs progress > 0%"
              : forecastVariance! < 0
              ? `${fmtMoney(Math.abs(forecastVariance!))} over budget`
              : `${fmtMoney(forecastVariance!)} under budget`
          }
        />
      </div>

      <p className="text-[10px] text-brand-inkFaint italic">
        Forecast at completion extrapolates current spend against reported completion % — it&rsquo;s an early-warning
        indicator, not an accounting figure, and it assumes spend scales linearly with progress.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const color = tone === "bad" ? "#C0392B" : tone === "good" ? "#1C1C1C" : "#1C1C1C";
  return (
    <div>
      <p className="font-mono text-[10px] font-bold tracking-widest text-brand-greenDark uppercase">{label}</p>
      <p className="font-heading text-lg font-extrabold" style={{ color }}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-brand-inkFaint">{sub}</p>}
    </div>
  );
}
