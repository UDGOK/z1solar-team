import { prisma } from "./prisma";
import type { CurrentMember } from "./auth";

/** Whether `member` can see the project at all. Admins always can. */
export async function canViewProject(member: CurrentMember, projectId: string): Promise<boolean> {
  if (member.role === "ADMIN") return true;
  const access = await prisma.projectAccess.findUnique({
    where: { projectId_memberId: { projectId, memberId: member.id } },
  });
  return !access?.hidden;
}

/** Whether `member` can see financials on this specific project. Admins always can. */
export async function canViewProjectFinancials(member: CurrentMember, projectId: string): Promise<boolean> {
  if (member.role === "ADMIN") return true;
  const access = await prisma.projectAccess.findUnique({
    where: { projectId_memberId: { projectId, memberId: member.id } },
  });
  return !!access?.financialsVisible;
}

/** IDs of projects hidden from this member, for filtering list views. Admins: always empty. */
export async function getHiddenProjectIds(member: CurrentMember): Promise<Set<string>> {
  if (member.role === "ADMIN") return new Set();
  const rows = await prisma.projectAccess.findMany({
    where: { memberId: member.id, hidden: true },
    select: { projectId: true },
  });
  return new Set(rows.map((r) => r.projectId));
}
