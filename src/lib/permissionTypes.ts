/**
 * Permission keys and labels only — deliberately free of any Prisma/server
 * imports so client components can use this without pulling database code
 * into the browser bundle. The enforcement logic lives in permissions.ts.
 */

export type Permission =
  | "canView"
  | "canEditTalkingPoints"
  | "canEditKeyDates"
  | "canEditTodos"
  | "canEditQuestions"
  | "canEditTeam"
  | "canViewFiles"
  | "canUploadFiles"
  | "canViewFinancials"
  | "canEditFinancials"
  | "canEditStatus";

export const ALL_PERMISSIONS: { key: Permission; label: string }[] = [
  { key: "canView", label: "View project" },
  { key: "canEditTalkingPoints", label: "Edit talking points" },
  { key: "canEditKeyDates", label: "Edit key dates" },
  { key: "canEditTodos", label: "Edit to-dos" },
  { key: "canEditQuestions", label: "Edit open questions" },
  { key: "canEditTeam", label: "Edit team roster" },
  { key: "canViewFiles", label: "View files" },
  { key: "canUploadFiles", label: "Upload files" },
  { key: "canViewFinancials", label: "View financials" },
  { key: "canEditFinancials", label: "Edit financials" },
  { key: "canEditStatus", label: "Edit status / completion" },
];

export type ProjectPermissions = Record<Permission, boolean>;

export const ALL_TRUE: ProjectPermissions = {
  canView: true,
  canEditTalkingPoints: true,
  canEditKeyDates: true,
  canEditTodos: true,
  canEditQuestions: true,
  canEditTeam: true,
  canViewFiles: true,
  canUploadFiles: true,
  canViewFinancials: true,
  canEditFinancials: true,
  canEditStatus: true,
};

export const ALL_FALSE: ProjectPermissions = {
  canView: false,
  canEditTalkingPoints: false,
  canEditKeyDates: false,
  canEditTodos: false,
  canEditQuestions: false,
  canEditTeam: false,
  canViewFiles: false,
  canUploadFiles: false,
  canViewFinancials: false,
  canEditFinancials: false,
  canEditStatus: false,
};
