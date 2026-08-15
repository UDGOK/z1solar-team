import Link from "next/link";
import { prisma } from "@/lib/prisma";

const STATUS: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: "#F7F6F1", fg: "#8A8A85" },
  SUBMITTED: { bg: "#FAF3E8", fg: "#8B5A2B" },
  APPROVED: { bg: "#EAF3E7", fg: "#2F7328" },
  REJECTED: { bg: "#FBEDEA", fg: "#A32D2D" },
  ORDERED: { bg: "#EAF3E7", fg: "#3F9634" },
  RECEIVED: { bg: "#EAF3E7", fg: "#3F9634" },
  INVOICED: { bg: "#FAF3E8", fg: "#8B5A2B" },
  PAID: { bg: "#1C1C1C", fg: "#FFFFFF" },
  CANCELLED: { bg: "#F7F6F1", fg: "#B4B2A9" },
};

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * Purchases tied to this project. Pending approvals are pulled to the top and
 * highlighted — money waiting on a signature is the thing a project lead
 * actually needs to see, and it's easy to miss if it's buried in a list.
 */
export default async function ProjectPurchases({ projectId }: { projectId: string }) {
  const rows = await prisma.purchaseRequest.findMany({
    where: { projectId, status: { not: "CANCELLED" } },
    include: {
      requestedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (rows.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="kicker">Purchases</p>
          <Link href="/purchases" className="text-[11px] text-brand-greenDark hover:underline">
            + Raise a request
          </Link>
        </div>
        <p className="text-sm text-brand-inkFaint">No purchases raised against this project yet.</p>
      </div>
    );
  }

  const pending = rows.filter((r) => r.status === "SUBMITTED");
  const rest = rows.filter((r) => r.status !== "SUBMITTED");

  const pendingTotal = pending.reduce((n, r) => n + r.amount, 0);
  const committedTotal = rows
    .filter((r) => ["APPROVED", "ORDERED", "RECEIVED", "INVOICED", "PAID"].includes(r.status))
    .reduce((n, r) => n + r.amount, 0);
  const paidTotal = rows.filter((r) => r.status === "PAID").reduce((n, r) => n + r.amount, 0);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <p className="kicker">Purchases</p>
        <Link href="/purchases" className="text-[11px] text-brand-greenDark hover:underline">
          Manage all →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-white border border-brand-line rounded p-2.5" style={pending.length ? { borderLeft: "3px solid #E8743B" } : {}}>
          <p className="font-mono text-[8px] font-bold tracking-widest uppercase" style={{ color: pending.length ? "#8B5A2B" : "#8A8A85" }}>
            Awaiting approval
          </p>
          <p className="font-heading text-[16px] font-extrabold" style={{ color: pending.length ? "#E8743B" : "#1C1C1C" }}>
            {money(pendingTotal)}
          </p>
        </div>
        <div className="bg-white border border-brand-line rounded p-2.5">
          <p className="font-mono text-[8px] font-bold tracking-widest text-brand-greenDark uppercase">Committed</p>
          <p className="font-heading text-[16px] font-extrabold text-brand-ink">{money(committedTotal)}</p>
        </div>
        <div className="bg-white border border-brand-line rounded p-2.5">
          <p className="font-mono text-[8px] font-bold tracking-widest text-brand-greenDark uppercase">Paid</p>
          <p className="font-heading text-[16px] font-extrabold text-brand-ink">{money(paidTotal)}</p>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="rounded-md bg-orange-50 border border-orange-200 p-3 mb-3">
          <p className="text-[11px] font-semibold text-brand-amber mb-2">
            {pending.length} request{pending.length === 1 ? "" : "s"} waiting on approval
          </p>
          <div className="space-y-1.5">
            {pending.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-xs flex-wrap">
                <span className="min-w-0">
                  <span className="font-mono text-[9px] text-brand-inkFaint mr-1.5">
                    PR-{String(r.number).padStart(4, "0")}
                  </span>
                  <span className="font-semibold text-brand-ink">{r.title}</span>
                  <span className="text-brand-inkFaint"> · requested by {r.requestedBy?.name ?? "—"}</span>
                  {r.urgency === "Urgent" && <span className="ml-1.5 text-[9px] font-bold text-[#C0392B]">URGENT</span>}
                </span>
                <span className="font-semibold text-brand-ink shrink-0">{money(r.amount)}</span>
              </div>
            ))}
          </div>
          <Link href="/purchases" className="inline-block mt-2 text-[11px] font-semibold text-brand-greenDark hover:underline">
            Review and approve →
          </Link>
        </div>
      )}

      {rest.length > 0 && (
        <div className="space-y-1">
          {rest.map((r) => {
            const st = STATUS[r.status] || STATUS.DRAFT;
            return (
              <div key={r.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-brand-line last:border-0 text-xs flex-wrap">
                <span className="min-w-0 flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-[9px] text-brand-inkFaint">PR-{String(r.number).padStart(4, "0")}</span>
                  <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: st.bg, color: st.fg }}>
                    {r.status}
                  </span>
                  <span className="text-brand-ink">{r.title}</span>
                  {r.vendor && <span className="text-brand-inkFaint">· {r.vendor}</span>}
                  {r.approvedBy && <span className="text-brand-inkFaint">· approved by {r.approvedBy.name}</span>}
                </span>
                <span className="text-brand-inkSoft shrink-0">{money(r.amount)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
