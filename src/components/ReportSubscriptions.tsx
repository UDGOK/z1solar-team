"use client";

import { useState, useTransition } from "react";
import { setReportSubscription, sendWeeklyReportsNow } from "@/lib/actions";

type Sub = {
  memberId: string;
  name: string;
  email: string | null;
  enabled: boolean;
  includeStatus: boolean;
  includeTasks: boolean;
  includeKeyDates: boolean;
  includeQuestions: boolean;
  includeFinancials: boolean;
  canSeeFinancials: boolean;
};

const SECTIONS: { key: keyof Sub; label: string }[] = [
  { key: "includeStatus", label: "Status & progress" },
  { key: "includeTasks", label: "Tasks" },
  { key: "includeKeyDates", label: "Key dates" },
  { key: "includeQuestions", label: "Open questions" },
  { key: "includeFinancials", label: "Financials" },
];

export default function ReportSubscriptions({ projectId, rows: initial }: { projectId: string; rows: Sub[] }) {
  const [rows, setRows] = useState(initial);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function save(memberId: string, next: Sub) {
    setRows((prev) => prev.map((r) => (r.memberId === memberId ? next : r)));
    setSavingId(memberId);
    startTransition(async () => {
      await setReportSubscription(projectId, memberId, {
        enabled: next.enabled,
        includeStatus: next.includeStatus,
        includeTasks: next.includeTasks,
        includeKeyDates: next.includeKeyDates,
        includeQuestions: next.includeQuestions,
        includeFinancials: next.includeFinancials,
      });
      setSavingId(null);
    });
  }

  function toggle(memberId: string, key: keyof Sub, value: boolean) {
    const row = rows.find((r) => r.memberId === memberId)!;
    const next = { ...row, [key]: value } as Sub;
    if (key !== "enabled" && value) next.enabled = true;
    save(memberId, next);
  }

  function sendNow() {
    setSendResult(null);
    startTransition(async () => {
      const res = await sendWeeklyReportsNow();
      setSendResult(
        res.errors.length
          ? `Sent ${res.sent}, ${res.errors.length} failed: ${res.errors[0]}`
          : `Sent ${res.sent} report${res.sent === 1 ? "" : "s"}${res.skipped ? `, ${res.skipped} skipped (nothing to report)` : ""}.`
      );
    });
  }

  return (
    <div className="p-5 border-t border-brand-line">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <p className="kicker">Weekly Report Subscriptions</p>
        <button onClick={sendNow} className="btn-secondary text-[11px] !px-2 !py-1">
          Send now (test)
        </button>
      </div>
      <p className="text-xs text-brand-inkFaint mb-4">
        Pick exactly what each person receives in the Monday digest for this project. Financials only send to people
        who also have financial permission — that&rsquo;s re-checked at send time.
      </p>
      {sendResult && (
        <p className="text-xs text-brand-greenDark mb-3 font-semibold">{sendResult}</p>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.memberId} className="border border-brand-line rounded-md bg-white p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="min-w-0">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => toggle(r.memberId, "enabled", e.target.checked)}
                    className="w-4 h-4 accent-[#4CAB3E]"
                  />
                  <span className="font-semibold text-brand-ink text-sm">{r.name}</span>
                  {savingId === r.memberId && <span className="text-[11px] text-brand-inkFaint">saving…</span>}
                </label>
                <p className="text-[11px] text-brand-inkFaint truncate ml-6">
                  {r.email || "no email — won't receive reports"}
                </p>
              </div>
            </div>

            {r.enabled && (
              <div className="grid sm:grid-cols-3 gap-1.5 ml-6">
                {SECTIONS.map((s) => {
                  const isFin = s.key === "includeFinancials";
                  const blocked = isFin && !r.canSeeFinancials;
                  return (
                    <label
                      key={s.key}
                      className={`flex items-center gap-2 text-xs ${blocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      title={blocked ? "This person has no financial permission on this project" : undefined}
                    >
                      <input
                        type="checkbox"
                        disabled={blocked}
                        checked={!!r[s.key]}
                        onChange={(e) => toggle(r.memberId, s.key, e.target.checked)}
                        className="w-3.5 h-3.5 accent-[#4CAB3E]"
                      />
                      <span className="text-brand-inkSoft">
                        {s.label}
                        {blocked && " 🔒"}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-brand-inkFaint">No team members yet.</p>}
      </div>
    </div>
  );
}
