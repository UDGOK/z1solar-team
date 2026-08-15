import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGlobalCapabilities, getViewableProjectIds } from "@/lib/permissions";
import { PAGE_CONTAINER } from "@/lib/layout";
import AppShell from "@/components/AppShell";
import PurchasesHub, { type PurchaseItem } from "@/components/PurchasesHub";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const me = await requirePageAuth();
  const isAdmin = me.role === "ADMIN";
  const caps = await getGlobalCapabilities(me);

  if (!isAdmin && !caps.canRequestPurchases && !caps.canApprovePurchases && !caps.canViewAllPurchases) {
    notFound();
  }

  const viewableIds = await getViewableProjectIds(me);
  const seeEverything = isAdmin || caps.canViewAllPurchases || caps.canApprovePurchases;

  const [rows, projects, tradeShows] = await Promise.all([
    prisma.purchaseRequest.findMany({
      // Approvers see everything; everyone else sees their own requests plus
      // anything on a project they already have access to.
      where: seeEverything
        ? {}
        : { OR: [{ requestedById: me.id }, { projectId: { in: viewableIds } }] },
      include: {
        project: { select: { title: true, estBudget: true, committed: true } },
        requestedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        secondApprovedBy: { select: { name: true } },
        comments: { orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.project.findMany({
      where: { archived: false, id: { in: viewableIds } },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    prisma.tradeShow.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true }, take: 30 }),
  ]);

  const purchases: PurchaseItem[] = rows.map((p) => ({
    id: p.id,
    number: p.number,
    title: p.title,
    description: p.description,
    category: p.category,
    projectId: p.projectId,
    projectTitle: p.project?.title ?? null,
    vendor: p.vendor,
    quantity: p.quantity,
    unitCost: p.unitCost,
    amount: p.amount,
    neededBy: p.neededBy ? p.neededBy.toISOString() : null,
    urgency: p.urgency,
    status: p.status,
    requestedByName: p.requestedBy?.name ?? null,
    requestedById: p.requestedById,
    approvedByName: p.approvedBy?.name ?? null,
    secondApprovedByName: p.secondApprovedBy?.name ?? null,
    poNumber: p.poNumber,
    invoiceRef: p.invoiceRef,
    budget: p.project?.estBudget ?? 0,
    committed: p.project?.committed ?? 0,
    comments: p.comments.map((c) => ({
      id: c.id, authorName: c.authorName, body: c.body, kind: c.kind, createdAt: c.createdAt.toISOString(),
    })),
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <AppShell active="/purchases">
      <main className={PAGE_CONTAINER}>
        <div className="mb-5">
          <p className="text-[8.5px] font-semibold tracking-[0.14em] text-brand-green">[ Z1POWER ]</p>
          <h1 className="font-heading font-extrabold text-[20px] sm:text-[22px] text-brand-ink tracking-tight mt-0.5">Purchases</h1>
          <p className="text-[11px] text-brand-inkSoft mt-0.5">
            Requests, approvals, and what it does to the project budget.
          </p>
        </div>
        <PurchasesHub
          purchases={purchases}
          projects={projects}
          tradeShows={tradeShows}
          currentMemberId={me.id}
          canRequest={isAdmin || caps.canRequestPurchases}
          canApprove={isAdmin || caps.canApprovePurchases}
          canRecordPayments={isAdmin || caps.canRecordPayments}
        />
      </main>
    </AppShell>
  );
}
