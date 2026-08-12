"use client";

import { useState, useTransition } from "react";
import { setProjectAccess } from "@/lib/actions";

type AccessRow = {
  memberId: string;
  name: string;
  hidden: boolean;
  financialsVisible: boolean;
};

export default function ProjectAccessPanel({ projectId, rows: initialRows }: { projectId: string; rows: AccessRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update(memberId: string, patch: Partial<AccessRow>) {
    const next = rows.map((r) => (r.memberId === memberId ? { ...r, ...patch } : r));
    setRows(next);
    const row = next.find((r) => r.memberId === memberId)!;
    setSavingId(memberId);
    startTransition(async () => {
      await setProjectAccess(projectId, memberId, { hidden: row.hidden, financialsVisible: row.financialsVisible });
      setSavingId(null);
    });
  }

  return (
    <div className="p-5 border-t border-brand-line">
      <p className="kicker mb-2">Access Control — This Project</p>
      <p className="text-xs text-brand-inkFaint mb-3">
        By default every member can see this project but not its financials. Override either per person below.
      </p>
      <div className="border border-brand-line rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-ink text-white text-left">
              <th className="px-3 py-2 font-mono text-[11px] tracking-widest">MEMBER</th>
              <th className="px-3 py-2 font-mono text-[11px] tracking-widest text-center">HIDE PROJECT</th>
              <th className="px-3 py-2 font-mono text-[11px] tracking-widest text-center">SHOW FINANCIALS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.memberId} className={`border-t border-brand-line ${i % 2 === 1 ? "bg-brand-greenTint" : ""}`}>
                <td className="px-3 py-2 font-semibold text-brand-ink">
                  {r.name} {savingId === r.memberId && <span className="text-brand-inkFaint text-xs">saving…</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={r.hidden}
                    disabled={isPending}
                    onChange={(e) => update(r.memberId, { hidden: e.target.checked })}
                    className="w-4 h-4 accent-[#C0392B]"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={r.financialsVisible}
                    disabled={isPending}
                    onChange={(e) => update(r.memberId, { financialsVisible: e.target.checked })}
                    className="w-4 h-4 accent-[#4CAB3E]"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
