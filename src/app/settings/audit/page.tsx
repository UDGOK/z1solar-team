import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGlobalCapabilities } from "@/lib/permissions";
import { PAGE_CONTAINER } from "@/lib/layout";
import AppShell from "@/components/AppShell";
import AuditPanel, { type AuditEntry } from "@/components/AuditPanel";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const me = await requirePageAuth();
  const isAdmin = me.role === "ADMIN";
  const caps = await getGlobalCapabilities(me);
  if (!isAdmin && !caps.canViewAuditLog) redirect("/settings");

  const [rows, lastRun] = await Promise.all([
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.reconciliationRun.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  const entries: AuditEntry[] = rows.map((r) => ({
    id: r.id,
    entityType: r.entityType,
    entityLabel: r.entityLabel,
    action: r.action,
    summary: r.summary,
    isFinancial: r.isFinancial,
    actorName: r.actorName,
    createdAt: r.createdAt.toISOString(),
    changes: r.changes ? (JSON.parse(r.changes) as any) : null,
  }));

  return (
    <AppShell active="/settings">
      <main className={PAGE_CONTAINER}>
        <Link href="/settings" className="text-xs font-semibold text-brand-greenDark hover:underline">← Back to Settings</Link>
        <h1 className="font-heading font-extrabold text-[20px] text-brand-ink tracking-tight mt-2 mb-1">Audit &amp; Integrity</h1>
        <p className="text-[11px] text-brand-inkSoft mb-5">
          Who changed what, financial reconciliation, and backup restore.
        </p>
        <AuditPanel
          entries={entries}
          canReconcile={isAdmin || caps.canViewAllFinancials}
          canRepair={isAdmin}
          canRestore={isAdmin || caps.canRestoreBackup}
          lastRun={lastRun ? {
            runByName: lastRun.runByName,
            driftFound: lastRun.driftFound,
            driftRepaired: lastRun.driftRepaired,
            createdAt: lastRun.createdAt.toISOString(),
          } : null}
        />
      </main>
    </AppShell>
  );
}
