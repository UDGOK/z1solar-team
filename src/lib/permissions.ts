import { prisma } from "./prisma";
import type { CurrentMember } from "./auth";
import { ALL_TRUE, ALL_FALSE, type Permission, type ProjectPermissions } from "./permissionTypes";

export type { Permission, ProjectPermissions };
export { ALL_PERMISSIONS } from "./permissionTypes";

/** Global, non-project capabilities that come from a member's role. */
export type GlobalCapabilities = {
  canCreateProjects: boolean;
  canDeleteAnyProject: boolean;
  canViewAllProjects: boolean;
  canEditAllProjects: boolean;
  canViewAllFinancials: boolean;
  canEditAllFinancials: boolean;
  canManageTeam: boolean;
  canManageRoles: boolean;
  canSendAlerts: boolean;
  canManageTradeShows: boolean;
  canViewReports: boolean;
  canManageMeetings: boolean;
  canViewMeetings: boolean;
  canTakeMeetingNotes: boolean;
  canManageResources: boolean;
  canViewResources: boolean;
  canManageCategories: boolean;
  canViewSms: boolean;
  canSendSms: boolean;
  canManageSmsContacts: boolean;
};

const ALL_CAPS_TRUE: GlobalCapabilities = {
  canCreateProjects: true, canDeleteAnyProject: true, canViewAllProjects: true,
  canEditAllProjects: true, canViewAllFinancials: true, canEditAllFinancials: true,
  canManageTeam: true, canManageRoles: true, canSendAlerts: true,
  canManageTradeShows: true, canViewReports: true,
  canManageMeetings: true, canViewMeetings: true, canTakeMeetingNotes: true,
  canManageResources: true, canViewResources: true, canManageCategories: true,
  canViewSms: true, canSendSms: true, canManageSmsContacts: true,
};

const ALL_CAPS_FALSE: GlobalCapabilities = {
  canCreateProjects: false, canDeleteAnyProject: false, canViewAllProjects: false,
  canEditAllProjects: false, canViewAllFinancials: false, canEditAllFinancials: false,
  canManageTeam: false, canManageRoles: false, canSendAlerts: false,
  canManageTradeShows: false, canViewReports: false,
  canManageMeetings: false, canViewMeetings: false, canTakeMeetingNotes: false,
  canManageResources: false, canViewResources: false, canManageCategories: false,
  canViewSms: false, canSendSms: false, canManageSmsContacts: false,
};

/**
 * Resolves a member's global capabilities.
 *
 * System admins (legacy role === "ADMIN") always get everything — that check
 * comes first so no amount of role misconfiguration can lock out an admin.
 */
export async function getGlobalCapabilities(member: CurrentMember): Promise<GlobalCapabilities> {
  if (member.role === "ADMIN") return { ...ALL_CAPS_TRUE };

  const record = await prisma.teamMember.findUnique({
    where: { id: member.id },
    include: { customRole: true },
  });
  const r = record?.customRole;
  if (!r) return { ...ALL_CAPS_FALSE };

  return {
    canCreateProjects: r.canCreateProjects,
    canDeleteAnyProject: r.canDeleteAnyProject,
    canViewAllProjects: r.canViewAllProjects,
    canEditAllProjects: r.canEditAllProjects,
    canViewAllFinancials: r.canViewAllFinancials,
    canEditAllFinancials: r.canEditAllFinancials,
    canManageTeam: r.canManageTeam,
    canManageRoles: r.canManageRoles,
    canSendAlerts: r.canSendAlerts,
    canManageTradeShows: r.canManageTradeShows,
    canViewReports: r.canViewReports,
    canManageMeetings: r.canManageMeetings,
    canViewMeetings: r.canViewMeetings,
    canTakeMeetingNotes: r.canTakeMeetingNotes,
    canManageResources: r.canManageResources,
    canViewResources: r.canViewResources,
    canManageCategories: r.canManageCategories,
    canViewSms: r.canViewSms,
    canSendSms: r.canSendSms,
    canManageSmsContacts: r.canManageSmsContacts,
  };
}

/**
 * Resolves what `member` may do on `projectId`.
 *
 * Order matters — first match wins:
 *   1. System admin                → everything
 *   2. Project owner (creator)     → everything on their own project
 *   3. Role-level global grants    → e.g. "view all projects"
 *   4. Explicit ProjectAccess row  → per-project checkboxes
 *   5. Default deny
 *
 * Ownership deliberately outranks role grants so a project lead can't lose
 * control of their own project when someone edits a role.
 */
export async function getProjectPermissions(
  member: CurrentMember,
  projectId: string
): Promise<ProjectPermissions> {
  // 1. System admin
  if (member.role === "ADMIN") return { ...ALL_TRUE };

  const [project, access, caps] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } }),
    prisma.projectAccess.findUnique({
      where: { projectId_memberId: { projectId, memberId: member.id } },
    }),
    getGlobalCapabilities(member),
  ]);

  // 2. Owner of this project
  if (project?.ownerId === member.id) return { ...ALL_TRUE };

  // 3. Role-level global grants
  if (caps.canEditAllProjects) {
    return {
      ...ALL_TRUE,
      canViewFinancials: caps.canViewAllFinancials || caps.canEditAllFinancials,
      canEditFinancials: caps.canEditAllFinancials,
    };
  }
  if (caps.canViewAllProjects) {
    // Read-across-the-board, but writing still needs an explicit grant.
    return {
      ...ALL_FALSE,
      canView: true,
      canViewFiles: true,
      canViewFinancials: caps.canViewAllFinancials || caps.canEditAllFinancials,
      canEditFinancials: caps.canEditAllFinancials,
      // Fold in any explicit per-project edit rights they've also been given.
      canEditTalkingPoints: access?.canEditTalkingPoints ?? false,
      canEditKeyDates: access?.canEditKeyDates ?? false,
      canEditTodos: access?.canEditTodos ?? false,
      canEditQuestions: access?.canEditQuestions ?? false,
      canEditTeam: access?.canEditTeam ?? false,
      canUploadFiles: access?.canUploadFiles ?? false,
      canEditStatus: access?.canEditStatus ?? false,
    };
  }

  // 4. Explicit per-project grant
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
    // A blanket financial grant from the role tops up the per-project row.
    canViewFinancials: access.canViewFinancials || caps.canViewAllFinancials || caps.canEditAllFinancials,
    canEditFinancials: access.canEditFinancials || caps.canEditAllFinancials,
    canEditStatus: access.canEditStatus,
  };
}

export async function hasPermission(
  member: CurrentMember,
  projectId: string,
  permission: Permission
): Promise<boolean> {
  const perms = await getProjectPermissions(member, projectId);
  return perms[permission];
}

/** IDs of every project this member may see. */
export async function getViewableProjectIds(member: CurrentMember): Promise<string[]> {
  if (member.role === "ADMIN") {
    const all = await prisma.project.findMany({ where: { archived: false }, select: { id: true } });
    return all.map((p) => p.id);
  }

  const caps = await getGlobalCapabilities(member);
  if (caps.canViewAllProjects || caps.canEditAllProjects) {
    const all = await prisma.project.findMany({ where: { archived: false }, select: { id: true } });
    return all.map((p) => p.id);
  }

  // Own projects plus anything explicitly granted.
  const [owned, granted] = await Promise.all([
    prisma.project.findMany({ where: { ownerId: member.id, archived: false }, select: { id: true } }),
    prisma.projectAccess.findMany({
      where: { memberId: member.id, canView: true },
      select: { projectId: true },
    }),
  ]);
  return Array.from(new Set([...owned.map((p) => p.id), ...granted.map((g) => g.projectId)]));
}

/** Convenience for UI gating. */
export async function canCreateProjects(member: CurrentMember): Promise<boolean> {
  const caps = await getGlobalCapabilities(member);
  return caps.canCreateProjects;
}
