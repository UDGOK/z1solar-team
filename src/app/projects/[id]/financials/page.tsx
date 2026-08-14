import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProjectPermissions } from "@/lib/permissions";
import AppShell from "@/components/AppShell";
import FinancialLedger from "@/components/FinancialLedger";
import FinancialsLocked from "@/components/FinancialsLocked";
import { toDateInputValue } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FinancialsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const member = await requirePageAuth();
  const perms = await getProjectPermissions(member, projectId);
  if (!perms.canView) notFound();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { lineItems: { orderBy: { order: "asc" } } },
  });
  if (!project) notFound();

  return (
    <AppShell active="/projects">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <Link href={`/projects/${project.id}`} className="text-xs font-semibold text-brand-greenDark hover:underline">
            ← Back to project
          </Link>
          <p className="kicker mt-2 mb-1">[ Z1POWER — FINANCIALS ]</p>
          <h1 className="font-heading text-3xl font-extrabold text-brand-ink">{project.title}</h1>
        </div>

        {perms.canViewFinancials ? (
          <FinancialLedger
            projectId={project.id}
            canEdit={perms.canEditFinancials}
            initial={project.lineItems.map((l) => ({
              category: l.category,
              description: l.description,
              vendor: l.vendor || "",
              qty: l.qty,
              unitCost: l.unitCost,
              actualAmount: l.actualAmount,
              invoiceRef: l.invoiceRef || "",
              paidDate: toDateInputValue(l.paidDate),
              status: l.status,
              notes: l.notes || "",
            }))}
          />
        ) : (
          <div className="card overflow-hidden bg-white">
            <FinancialsLocked />
          </div>
        )}
      </main>
    </AppShell>
  );
}
