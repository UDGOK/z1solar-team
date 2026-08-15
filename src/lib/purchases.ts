import { prisma } from "@/lib/prisma";

/**
 * Approval thresholds. Deliberately a single place, and deliberately tiered —
 * a $95 trade show pass and a $180k transformer shouldn't take the same route.
 *
 * SECOND_SIGNOFF_OVER is the amount above which one approval isn't enough.
 */
export const THRESHOLDS = {
  /** At or below this, a project lead/owner can approve. */
  LEAD_LIMIT: 500,
  /** At or below this, anyone with canApprovePurchases can approve. */
  APPROVER_LIMIT: 25_000,
  /** Above this, a second, different approver must also sign off. */
  SECOND_SIGNOFF_OVER: 25_000,
};

/** Categories that must be attributed to a project. */
export const PROJECT_REQUIRED = ["MATERIAL", "SUBCONTRACTOR"];

export const CATEGORIES = [
  { key: "MATERIAL", label: "Material" },
  { key: "SUBCONTRACTOR", label: "Subcontractor" },
  { key: "TRADE_SHOW", label: "Trade show" },
  { key: "MARKETING", label: "Marketing" },
  { key: "SOFTWARE", label: "Software / subscription" },
  { key: "TRAVEL", label: "Travel" },
  { key: "OFFICE", label: "Office / admin" },
  { key: "OTHER", label: "Other" },
];

export type ApprovalCheck = {
  canApprove: boolean;
  reason?: string;
  needsSecondSignoff: boolean;
};

/**
 * Decides whether this person may approve this specific request.
 *
 * Self-approval is blocked by default. With several approvers available it
 * costs nothing, and an approval trail where the requester never signed their
 * own request is exactly what an auditor or investor wants to see. It also
 * protects the person approving.
 */
export async function canApprovePurchase(
  member: { id: string; role: string },
  purchaseId: string,
  opts?: { allowSelfApproval?: boolean }
): Promise<ApprovalCheck> {
  const purchase = await prisma.purchaseRequest.findUnique({
    where: { id: purchaseId },
    select: {
      requestedById: true,
      amount: true,
      status: true,
      approvedById: true,
      projectId: true,
      project: { select: { leadId: true, ownerId: true } },
    },
  });
  if (!purchase) return { canApprove: false, reason: "Request not found.", needsSecondSignoff: false };

  const needsSecond = purchase.amount > THRESHOLDS.SECOND_SIGNOFF_OVER;

  if (purchase.status === "DRAFT") {
    return { canApprove: false, reason: "This request hasn't been submitted yet.", needsSecondSignoff: needsSecond };
  }
  if (!["SUBMITTED", "APPROVED"].includes(purchase.status)) {
    return { canApprove: false, reason: `This request is already ${purchase.status.toLowerCase()}.`, needsSecondSignoff: needsSecond };
  }
  // Only relevant for the second signature.
  if (purchase.status === "APPROVED" && !needsSecond) {
    return { canApprove: false, reason: "Already approved.", needsSecondSignoff: false };
  }

  if (!opts?.allowSelfApproval && purchase.requestedById === member.id) {
    return {
      canApprove: false,
      reason: "You can't approve your own request — someone else needs to sign it off.",
      needsSecondSignoff: needsSecond,
    };
  }
  // The same person can't provide both signatures on a high-value request.
  if (purchase.status === "APPROVED" && purchase.approvedById === member.id) {
    return {
      canApprove: false,
      reason: "This needs a second, different approver.",
      needsSecondSignoff: true,
    };
  }

  const isAdmin = member.role === "ADMIN";
  const { getGlobalCapabilities } = await import("@/lib/permissions");
  const caps = await getGlobalCapabilities(member as any);

  if (isAdmin || caps.canApprovePurchases) {
    if (purchase.amount > THRESHOLDS.APPROVER_LIMIT && !isAdmin) {
      return {
        canApprove: false,
        reason: `Requests over $${THRESHOLDS.APPROVER_LIMIT.toLocaleString()} need an administrator.`,
        needsSecondSignoff: needsSecond,
      };
    }
    return { canApprove: true, needsSecondSignoff: needsSecond };
  }

  // Small, project-scoped spend can be cleared by the lead or owner.
  const isLead =
    purchase.project?.leadId === member.id || purchase.project?.ownerId === member.id;
  if (isLead && purchase.amount <= THRESHOLDS.LEAD_LIMIT) {
    return { canApprove: true, needsSecondSignoff: false };
  }

  return {
    canApprove: false,
    reason: "You don't have permission to approve purchases.",
    needsSecondSignoff: needsSecond,
  };
}

export type BudgetImpact = {
  hasProject: boolean;
  projectTitle?: string;
  budget: number;
  committed: number;
  actual: number;
  newCommitted: number;
  pctAfter: number;
  overBudget: boolean;
  remainingAfter: number;
};

/**
 * What this request does to the project's budget. Shown at the moment of
 * approval — approving a number is different from approving a decision.
 */
export async function budgetImpact(purchaseId: string): Promise<BudgetImpact | null> {
  const p = await prisma.purchaseRequest.findUnique({
    where: { id: purchaseId },
    select: { amount: true, projectId: true, project: { select: { title: true, estBudget: true, committed: true, actualSpend: true } } },
  });
  if (!p) return null;
  if (!p.project) {
    return {
      hasProject: false, budget: 0, committed: 0, actual: 0,
      newCommitted: p.amount, pctAfter: 0, overBudget: false, remainingAfter: 0,
    };
  }

  const budget = p.project.estBudget || 0;
  const committed = p.project.committed || 0;
  const newCommitted = committed + p.amount;
  return {
    hasProject: true,
    projectTitle: p.project.title,
    budget,
    committed,
    actual: p.project.actualSpend || 0,
    newCommitted,
    pctAfter: budget > 0 ? Math.round((newCommitted / budget) * 1000) / 10 : 0,
    overBudget: budget > 0 && newCommitted > budget,
    remainingAfter: budget - newCommitted,
  };
}

export function statusColor(status: string): { bg: string; fg: string } {
  switch (status) {
    case "DRAFT": return { bg: "#F7F6F1", fg: "#8A8A85" };
    case "SUBMITTED": return { bg: "#FAF3E8", fg: "#8B5A2B" };
    case "APPROVED": return { bg: "#EAF3E7", fg: "#2F7328" };
    case "REJECTED": return { bg: "#FBEDEA", fg: "#A32D2D" };
    case "ORDERED": return { bg: "#EAF3E7", fg: "#3F9634" };
    case "RECEIVED": return { bg: "#EAF3E7", fg: "#3F9634" };
    case "INVOICED": return { bg: "#FAF3E8", fg: "#8B5A2B" };
    case "PAID": return { bg: "#1C1C1C", fg: "#FFFFFF" };
    default: return { bg: "#F7F6F1", fg: "#8A8A85" };
  }
}
