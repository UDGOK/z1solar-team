import { prisma } from "./prisma";
import type { CurrentMember } from "./auth";
import { ALL_TRUE, ALL_FALSE, type Permission, type ProjectPermissions } from "./permissionTypes";

export type { Permission, ProjectPermissions };
export { ALL_PERMISSIONS } from "./permissionTypes";

/**
 * Resolves what `member` may do on `projectId`.
 *
 * DEFAULT DENY: with no ProjectAccess row, a member gets nothing. Admins
 * always get everything and never need a row.
 *
 * `canView` is the master switch — if it's off, every other flag is forced
 * off too, so a stale "canEditTodos" can never leak access to a project the
 * person isn't supposed to see at all.
 */
export async function getProjectPermissions(
  member: CurrentMember,
  projectId: string
): Promise<ProjectPermissions> {
  if (member.role === "ADMIN") return { ...ALL_TRUE };

  const access = await prisma.projectAccess.findUnique({
    where: { projectId_memberId: { projectId, memberId: member.id } },
  });
  if (!access || !access.canView) return { ...ALL_FALSE };

  return {
    canView: access.canView,
    canEditTalkingPoints: access.canEditTalkingPoints,
    canEditKeyDates: access.canEditKeyDates,
    canEditTodos: access.canEditTodos,
    canEditQuestions: access.canEditQuestions,
    canEditTeam: access.canEditTeam,
    canViewFiles: access.canViewFiles,
    canUploadFiles: access.canUploadFiles,
    canViewFinancials: access.canViewFinancials,
    canEditFinancials: access.canEditFinancials,
    canEditStatus: access.canEditStatus,
  };
}

/** Convenience: does this member have one specific permission on this project? */
export async function hasPermission(
  member: CurrentMember,
  projectId: string,
  permission: Permission
): Promise<boolean> {
  const perms = await getProjectPermissions(member, projectId);
  return perms[permission];
}

/**
 * IDs of every project this member is allowed to see. Admins get all of them.
 * Used to filter list views (dashboard, projects list) at the query level.
 */
export async function getViewableProjectIds(member: CurrentMember): Promise<string[]> {
  if (member.role === "ADMIN") {
    const all = await prisma.project.findMany({ where: { archived: false }, select: { id: true } });
    return all.map((p) => p.id);
  }
  const rows = await prisma.projectAccess.findMany({
    where: { memberId: member.id, canView: true },
    select: { projectId: true },
  });
  return rows.map((r) => r.projectId);
}
