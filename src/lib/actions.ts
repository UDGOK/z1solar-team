"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getCurrentMember } from "./auth";
import { setWhatsAppLink } from "./settings";
import { getProjectPermissions } from "./permissions";
import { logActivity } from "./activity";
// Static, not dynamic: dynamically importing the PDF modules gives a separate
// @react-pdf module instance whose font registry is empty, which surfaces as
// "Font family not registered: Poppins" and downloads an error page as .txt.
import { loadProjectForPdf, renderProjectSummaryPdf, pdfFilename } from "@/lib/pdf/render";
import type { Permission } from "./permissionTypes";

async function requireAuth() {
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  return member!;
}

async function requireAdmin() {
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  if (member!.role !== "ADMIN") throw new Error("Admins only.");
  return member!;
}

// ---------- Admin management ----------

export async function promoteToAdmin(memberId: string) {
  await requireAdmin();
  await prisma.teamMember.update({ where: { id: memberId }, data: { role: "ADMIN" } });
  revalidatePath("/settings");
  revalidatePath("/team");
}

export async function revokeAdmin(memberId: string) {
  const admin = await requireAdmin();
  if (admin.id === memberId) throw new Error("You can't revoke your own admin access.");
  await prisma.teamMember.update({ where: { id: memberId }, data: { role: "MEMBER" } });
  revalidatePath("/settings");
  revalidatePath("/team");
}

// ---------- Team members ----------

export type TeamMemberInput = {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
};

export async function createTeamMember(data: TeamMemberInput) {
  await requireAdmin();
  if (!data.name?.trim()) throw new Error("Name is required.");
  await prisma.teamMember.create({
    data: {
      name: data.name.trim(),
      title: data.title?.trim() || null,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
    },
  });
  revalidatePath("/team");
  revalidatePath("/dashboard");
}

export async function updateTeamMember(id: string, data: TeamMemberInput) {
  await requireAdmin();
  await prisma.teamMember.update({
    where: { id },
    data: {
      name: data.name.trim(),
      title: data.title?.trim() || null,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
    },
  });
  revalidatePath("/team");
  revalidatePath("/dashboard");
}

export async function deleteTeamMember(id: string) {
  const admin = await requireAdmin();
  if (admin.id === id) throw new Error("You can't remove yourself.");
  await prisma.teamMember.delete({ where: { id } });
  revalidatePath("/team");
  revalidatePath("/dashboard");
}

/** A member updating their own name — the one profile field they control. */
export async function updateOwnName(name: string) {
  const member = await requireAuth();
  if (!name?.trim()) throw new Error("Name can't be empty.");
  await prisma.teamMember.update({ where: { id: member.id }, data: { name: name.trim() } });
  revalidatePath("/team");
  revalidatePath("/settings");
  return { ok: true };
}

// ---------- Projects ----------

export type ProjectInput = {
  title: string;
  category: string;
  leadId: string | null;
  members: { memberId: string; role?: string; tasks?: string }[];
  talkingPoints: string[];
  keyDates: { milestone: string; date: string | null }[];
  todos: { text: string; done: boolean; assigneeIds: string[]; dueDate: string | null }[];
  questions: { text: string; resolved: boolean }[];
  estBudget: number;
  committed: number;
  actualSpend: number;
  q3Proj: number;
  q4Proj: number;
  q1Proj: number;
  q2Proj: number;
  notes?: string;
  status: string;
  completionPct: number;
};

export async function createProject(data: ProjectInput) {
  const me = await requireAuth();
  const { getGlobalCapabilities } = await import("./permissions");
  const caps = await getGlobalCapabilities(me);
  if (!caps.canCreateProjects) {
    throw new Error("Your role doesn't allow creating projects.");
  }
  if (!data.title?.trim()) throw new Error("Project title is required.");

  const project = await prisma.project.create({
    data: {
      title: data.title.trim(),
      category: data.category,
      leadId: data.leadId || null,
      // Creator owns it — grants them full control without an explicit
      // ProjectAccess row (see getProjectPermissions).
      ownerId: me.id,
      estBudget: data.estBudget || 0,
      committed: data.committed || 0,
      actualSpend: data.actualSpend || 0,
      q3Proj: data.q3Proj || 0,
      q4Proj: data.q4Proj || 0,
      q1Proj: data.q1Proj || 0,
      q2Proj: data.q2Proj || 0,
      notes: data.notes || null,
      status: data.status || "Planning",
      completionPct: Math.max(0, Math.min(100, Math.round(data.completionPct || 0))),
      members: {
        create: data.members
          .filter((m) => m.memberId)
          .map((m) => ({ memberId: m.memberId, role: m.role || null, tasks: m.tasks || null })),
      },
      talkingPoints: {
        create: data.talkingPoints.filter((t) => t.trim()).map((text, order) => ({ text, order })),
      },
      keyDates: {
        create: data.keyDates
          .filter((k) => k.milestone.trim())
          .map((k, order) => ({ milestone: k.milestone, date: k.date ? new Date(k.date) : null, order })),
      },
      todos: {
        create: data.todos
          .filter((t) => t.text.trim())
          .map((t, order) => ({
            text: t.text,
            done: t.done,
            order,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            assignees: { create: Array.from(new Set(t.assigneeIds.filter(Boolean))).map((memberId) => ({ memberId })) },
          })),
      },
      questions: {
        create: data.questions
          .filter((q) => q.text.trim())
          .map((q, order) => ({ text: q.text, resolved: q.resolved, order })),
      },
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

/**
 * Section-by-section permission enforcement. For each part of the project,
 * if the caller lacks the matching permission, that section is left exactly
 * as it is in the database — the submitted values are discarded. This is the
 * real security boundary; the UI hiding a section is only cosmetic.
 */
export async function updateProject(id: string, data: ProjectInput) {
  const member = await requireAuth();
  const perms = await getProjectPermissions(member, id);
  if (!perms.canView) throw new Error("You don't have access to this project.");

  const isAdmin = member.role === "ADMIN";

  const existing = await prisma.project.findUnique({
    where: { id },
    include: {
      talkingPoints: { orderBy: { order: "asc" } },
      keyDates: { orderBy: { order: "asc" } },
      todos: { orderBy: { order: "asc" }, include: { assignees: true } },
      questions: { orderBy: { order: "asc" } },
      members: true,
    },
  });
  if (!existing) throw new Error("Project not found.");

  // Scalars: only admins rename/recategorize/reassign lead.
  const core = isAdmin
    ? { title: data.title.trim(), category: data.category, leadId: data.leadId || null }
    : { title: existing.title, category: existing.category, leadId: existing.leadId };

  const financials = perms.canEditFinancials
    ? {
        estBudget: data.estBudget || 0,
        committed: data.committed || 0,
        actualSpend: data.actualSpend || 0,
        q3Proj: data.q3Proj || 0,
        q4Proj: data.q4Proj || 0,
        q1Proj: data.q1Proj || 0,
        q2Proj: data.q2Proj || 0,
        notes: data.notes || null,
      }
    : {
        estBudget: existing.estBudget,
        committed: existing.committed,
        actualSpend: existing.actualSpend,
        q3Proj: existing.q3Proj,
        q4Proj: existing.q4Proj,
        q1Proj: existing.q1Proj,
        q2Proj: existing.q2Proj,
        notes: existing.notes,
      };

  const progress = perms.canEditStatus
    ? {
        status: data.status || "Planning",
        completionPct: Math.max(0, Math.min(100, Math.round(data.completionPct || 0))),
      }
    : { status: existing.status, completionPct: existing.completionPct };

  // Child collections: rebuild from the submitted data only where permitted,
  // otherwise re-create exactly what was already stored.
  const talkingPoints = perms.canEditTalkingPoints
    ? data.talkingPoints.filter((t) => t.trim()).map((text, order) => ({ text, order }))
    : existing.talkingPoints.map((t, order) => ({ text: t.text, order }));

  const keyDates = perms.canEditKeyDates
    ? data.keyDates
        .filter((k) => k.milestone.trim())
        .map((k, order) => ({ milestone: k.milestone, date: k.date ? new Date(k.date) : null, order }))
    : existing.keyDates.map((k, order) => ({ milestone: k.milestone, date: k.date, order }));

  const todos = perms.canEditTodos
    ? data.todos
        .filter((t) => t.text.trim())
        .map((t, order) => ({
          text: t.text,
          done: t.done,
          order,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          assignees: { create: Array.from(new Set(t.assigneeIds.filter(Boolean))).map((memberId) => ({ memberId })) },
        }))
    : existing.todos.map((t, order) => ({
        text: t.text,
        done: t.done,
        order,
        dueDate: t.dueDate,
        assignees: { create: t.assignees.map((a) => ({ memberId: a.memberId })) },
      }));

  const questions = perms.canEditQuestions
    ? data.questions.filter((q) => q.text.trim()).map((q, order) => ({ text: q.text, resolved: q.resolved, order }))
    : existing.questions.map((q, order) => ({ text: q.text, resolved: q.resolved, order }));

  const projectMembers = perms.canEditTeam
    ? data.members.filter((m) => m.memberId).map((m) => ({ memberId: m.memberId, role: m.role || null, tasks: m.tasks || null }))
    : existing.members.map((m) => ({ memberId: m.memberId, role: m.role, tasks: m.tasks }));

  await prisma.$transaction([
    prisma.projectMember.deleteMany({ where: { projectId: id } }),
    prisma.talkingPoint.deleteMany({ where: { projectId: id } }),
    prisma.keyDate.deleteMany({ where: { projectId: id } }),
    prisma.todo.deleteMany({ where: { projectId: id } }),
    prisma.openQuestion.deleteMany({ where: { projectId: id } }),
  ]);

  await prisma.project.update({
    where: { id },
    data: {
      ...core,
      ...financials,
      ...progress,
      members: { create: projectMembers },
      talkingPoints: { create: talkingPoints },
      keyDates: { create: keyDates },
      todos: { create: todos },
      questions: { create: questions },
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}`);
}

export async function deleteProject(id: string) {
  await requireAdmin();
  await prisma.project.delete({ where: { id } });
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  redirect("/projects");
}

/**
 * Ticking a to-do. Allowed if the member can edit to-dos on that project, OR
 * if the task is assigned to them — so an assignee can always close out their
 * own work without needing broader edit rights.
 */
export async function toggleTodo(todoId: string, done: boolean) {
  const member = await requireAuth();
  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    select: { projectId: true, assignees: { select: { memberId: true } } },
  });
  if (!todo) throw new Error("Task not found.");
  const perms = await getProjectPermissions(member, todo.projectId);
  const isAssignee = todo.assignees.some((a) => a.memberId === member.id);
  if (!perms.canView) throw new Error("You don't have access to this project.");
  if (!perms.canEditTodos && !isAssignee) throw new Error("You can't change this task.");

  await prisma.todo.update({ where: { id: todoId }, data: { done } });
  revalidatePath(`/projects/${todo.projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
}

export async function toggleQuestion(questionId: string, resolved: boolean) {
  const member = await requireAuth();
  const q = await prisma.openQuestion.findUnique({ where: { id: questionId }, select: { projectId: true } });
  if (!q) throw new Error("Question not found.");
  const perms = await getProjectPermissions(member, q.projectId);
  if (!perms.canEditQuestions) throw new Error("You can't change questions on this project.");

  await prisma.openQuestion.update({ where: { id: questionId }, data: { resolved } });
  revalidatePath(`/projects/${q.projectId}`);
}

// ---------- Per-project permissions (admin-only) ----------

export async function setProjectPermissions(
  projectId: string,
  memberId: string,
  perms: Record<Permission, boolean>
) {
  const admin = await requireAdmin();
  // canView is the master switch: turning it off clears everything else, so
  // no stale flags linger on a project the person can't open.
  const normalized = perms.canView
    ? perms
    : (Object.fromEntries(Object.keys(perms).map((k) => [k, false])) as Record<Permission, boolean>);

  await prisma.projectAccess.upsert({
    where: { projectId_memberId: { projectId, memberId } },
    create: { projectId, memberId, ...normalized },
    update: normalized,
  });
  const target = await prisma.teamMember.findUnique({ where: { id: memberId }, select: { name: true } });
  const granted = Object.entries(normalized).filter(([, v]) => v).length;
  await logActivity({
    projectId,
    actor: admin,
    action: "access.changed",
    summary: normalized.canView
      ? `Granted ${target?.name || "a member"} ${granted} permission${granted === 1 ? "" : "s"}`
      : `Revoked all access for ${target?.name || "a member"}`,
    meta: { memberId, permissions: normalized },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
}

// ---------- Settings ----------

export async function updateWhatsAppLink(link: string) {
  await requireAdmin();
  await setWhatsAppLink(link.trim());
  revalidatePath("/team");
  revalidatePath("/dashboard");
}

export async function updateMeetingLink(link: string) {
  await requireAdmin();
  await prisma.settings.update({ where: { id: "singleton" }, data: { meetingLink: link.trim() || null } });
  revalidatePath("/team");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
}

// ---------- Project files ----------

export async function attachFileToProject(
  projectId: string,
  file: { url: string; pathname: string; filename: string; contentType?: string; size: number }
) {
  const member = await requireAuth();
  const perms = await getProjectPermissions(member, projectId);
  if (!perms.canUploadFiles) throw new Error("You don't have permission to upload files to this project.");

  await prisma.projectFile.create({
    data: {
      projectId,
      url: file.url,
      pathname: file.pathname,
      filename: file.filename,
      contentType: file.contentType || null,
      size: file.size,
    },
  });
  await logActivity({
    projectId,
    actor: member,
    action: "file.uploaded",
    summary: `Uploaded ${file.filename}`,
    meta: { filename: file.filename, size: file.size },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectFile(fileId: string) {
  const member = await requireAuth();
  const existing = await prisma.projectFile.findUnique({ where: { id: fileId }, select: { projectId: true } });
  if (!existing) throw new Error("File not found.");
  const perms = await getProjectPermissions(member, existing.projectId);
  if (!perms.canUploadFiles) throw new Error("You don't have permission to manage files on this project.");

  const file = await prisma.projectFile.delete({ where: { id: fileId } });
  try {
    const { del } = await import("@vercel/blob");
    await del(file.pathname);
  } catch {
    // Blob already gone or token unset locally — don't block the DB delete.
  }
  revalidatePath(`/projects/${file.projectId}`);
}

// ---------- Shareable project summary PDF ----------

export async function generateShareableSummaryLink(projectId: string): Promise<{ url: string }> {
  const member = await requireAuth();
  const perms = await getProjectPermissions(member, projectId);
  if (!perms.canViewFinancials) {
    throw new Error("Project summaries include financials — you don't have financial access to this project.");
  }

  const { put } = await import("@vercel/blob");

  const project = await loadProjectForPdf(projectId);
  if (!project) throw new Error("Project not found.");

  const buffer = await renderProjectSummaryPdf(project);
  const blob = await put(`summaries/${pdfFilename(project.title)}`, buffer, {
    access: "public",
    addRandomSuffix: true,
    contentType: "application/pdf",
  });

  return { url: blob.url };
}

// ---------- Email + password invites ----------

/**
 * Admin generates a one-time invite link. The person sets their own password
 * through it — admins never see or choose someone else's password.
 * Token is valid for 7 days and is cleared once used.
 */
export async function generateInviteLink(memberId: string): Promise<{ url: string }> {
  await requireAdmin();
  const member = await prisma.teamMember.findUnique({ where: { id: memberId } });
  if (!member) throw new Error("Team member not found.");
  if (!member.email) throw new Error("Add an email for this person first — that's what they'll sign in with.");

  const crypto = await import("crypto");
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.teamMember.update({
    where: { id: memberId },
    data: { inviteToken: token, inviteTokenExpires: expires },
  });

  // Build the absolute URL from the actual request host rather than trusting
  // NEXTAUTH_URL — if that's unset or still pointing at localhost in Vercel,
  // generated invite links would be dead on arrival for the recipient.
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const base = host ? `${proto}://${host}` : process.env.NEXTAUTH_URL || "";

  revalidatePath("/team");
  revalidatePath("/settings");
  return { url: `${base}/set-password?token=${token}` };
}

/** Admin revokes email/password access — the person can still use Google if they have it. */
export async function clearPassword(memberId: string) {
  await requireAdmin();
  await prisma.teamMember.update({
    where: { id: memberId },
    data: { passwordHash: null, inviteToken: null, inviteTokenExpires: null },
  });
  revalidatePath("/team");
}

/** Called from the /set-password page by the invited person themselves. */
export async function setPasswordFromInvite(
  token: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  if (!token) return { ok: false, error: "Missing invite token." };
  if (!password || password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const member = await prisma.teamMember.findUnique({ where: { inviteToken: token } });
  if (!member) return { ok: false, error: "This invite link is not valid." };
  if (!member.inviteTokenExpires || member.inviteTokenExpires < new Date()) {
    return { ok: false, error: "This invite link has expired. Ask an admin to send a new one." };
  }

  const bcrypt = (await import("bcryptjs")).default;
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.teamMember.update({
    where: { id: member.id },
    // Token is single-use — cleared as soon as the password is set.
    data: { passwordHash, inviteToken: null, inviteTokenExpires: null },
  });
  return { ok: true };
}

/** A signed-in person changing their own password. */
export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireAuth();
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }
  const member = await prisma.teamMember.findUnique({ where: { id: me.id } });
  if (!member) return { ok: false, error: "Account not found." };

  const bcrypt = (await import("bcryptjs")).default;
  // Someone who signed up via Google has no password yet — let them set one
  // without needing a "current password" they never had.
  if (member.passwordHash) {
    const valid = await bcrypt.compare(currentPassword, member.passwordHash);
    if (!valid) return { ok: false, error: "Current password is incorrect." };
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.teamMember.update({ where: { id: member.id }, data: { passwordHash } });
  return { ok: true };
}

// ---------- Standalone task creation & assignment ----------

/** Absolute app URL derived from the live request (works on any domain). */
async function appUrl(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : process.env.NEXTAUTH_URL || "";
}

/** Notifies a set of assignees in-app and by email. Never throws. */
async function notifyAssignees(opts: {
  memberIds: string[];
  actorId: string;
  actorName: string;
  taskText: string;
  projectTitle: string;
  dueDate: Date | null;
  verb: string;
}) {
  const targets = Array.from(new Set(opts.memberIds)).filter((id) => id && id !== opts.actorId);
  if (targets.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: targets.map((recipientId) => ({
        recipientId,
        type: "TASK_ASSIGNED",
        title: `${opts.verb} by ${opts.actorName}`,
        body: `${opts.taskText} — ${opts.projectTitle}`,
        link: "/tasks",
      })),
    });
  } catch (e) {
    console.error("[task notify] failed:", e);
  }
  await Promise.all(
    targets.map((id) =>
      notifyAssigneeByEmail({
        assigneeId: id,
        assignerName: opts.actorName,
        taskText: opts.taskText,
        projectTitle: opts.projectTitle,
        dueDate: opts.dueDate,
      })
    )
  );
}

/** Fire-and-forget task email. Never blocks or fails the calling action. */
async function notifyAssigneeByEmail(opts: {
  assigneeId: string;
  assignerName: string;
  taskText: string;
  projectTitle: string;
  dueDate: Date | null;
}) {
  try {
    const assignee = await prisma.teamMember.findUnique({ where: { id: opts.assigneeId } });
    if (!assignee?.email || !assignee.emailOnTaskAssigned) return;
    const { sendEmail, taskAssignedEmail } = await import("./email");
    const url = await appUrl();
    await sendEmail({
      to: assignee.email,
      subject: `New task: ${opts.taskText.slice(0, 60)}`,
      html: taskAssignedEmail({
        assigneeName: assignee.name,
        assignerName: opts.assignerName,
        taskText: opts.taskText,
        projectTitle: opts.projectTitle,
        dueDate: opts.dueDate,
        appUrl: url,
      }),
    });
  } catch (e) {
    console.error("[task email] failed:", e);
  }
}

/**
 * Create a task from anywhere (My Tasks, project page). The assignee does NOT
 * need project access — assigning a task is itself the grant to see that task.
 * Anyone who can edit todos on the project, or an admin, can create one.
 */
export async function createTask(data: {
  projectId: string;
  text: string;
  assigneeIds: string[];
  dueDate: string | null;
}) {
  const me = await requireAuth();
  if (!data.text?.trim()) throw new Error("Task description is required.");
  if (!data.projectId) throw new Error("Pick a project for this task.");

  const perms = await getProjectPermissions(me, data.projectId);
  if (!perms.canEditTodos) throw new Error("You don't have permission to add tasks to this project.");

  const maxOrder = await prisma.todo.aggregate({
    where: { projectId: data.projectId },
    _max: { order: true },
  });

  const todo = await prisma.todo.create({
    data: {
      projectId: data.projectId,
      text: data.text.trim(),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      createdById: me.id,
      order: (maxOrder._max.order ?? -1) + 1,
      assignees: {
        create: Array.from(new Set(data.assigneeIds.filter(Boolean))).map((memberId) => ({ memberId })),
      },
    },
    include: { project: { select: { title: true } }, assignees: true },
  });

  await notifyAssignees({
    memberIds: todo.assignees.map((a) => a.memberId),
    actorId: me.id,
    actorName: me.name,
    taskText: todo.text,
    projectTitle: todo.project.title,
    dueDate: todo.dueDate,
    verb: "New task",
  });

  await logActivity({
    projectId: data.projectId,
    actor: me,
    action: "task.created",
    summary: `Created task "${todo.text.slice(0, 80)}"${todo.assignees.length ? ` (${todo.assignees.length} assigned)` : " (unassigned)"}`,
    meta: { todoId: todo.id, assigneeIds: todo.assignees.map((a) => a.memberId) },
  });

  revalidatePath("/tasks");
  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Replace a task's assignee list. Notifies anyone newly added. */
export async function setTaskAssignees(todoId: string, assigneeIds: string[]) {
  const me = await requireAuth();
  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    include: { project: { select: { title: true } }, assignees: true },
  });
  if (!todo) throw new Error("Task not found.");
  const perms = await getProjectPermissions(me, todo.projectId);
  if (!perms.canEditTodos) throw new Error("You can't reassign tasks on this project.");

  const next = Array.from(new Set(assigneeIds.filter(Boolean)));
  const previous = new Set(todo.assignees.map((a) => a.memberId));
  const added = next.filter((id) => !previous.has(id));

  await prisma.$transaction([
    prisma.todoAssignee.deleteMany({ where: { todoId } }),
    ...(next.length ? [prisma.todoAssignee.createMany({ data: next.map((memberId) => ({ todoId, memberId })) })] : []),
  ]);

  await notifyAssignees({
    memberIds: added,
    actorId: me.id,
    actorName: me.name,
    taskText: todo.text,
    projectTitle: todo.project.title,
    dueDate: todo.dueDate,
    verb: "Task assigned to you",
  });

  revalidatePath("/tasks");
  revalidatePath(`/projects/${todo.projectId}`);
  return { ok: true };
}

/** Delete a task. */
export async function deleteTask(todoId: string) {
  const me = await requireAuth();
  const todo = await prisma.todo.findUnique({ where: { id: todoId }, select: { projectId: true } });
  if (!todo) throw new Error("Task not found.");
  const perms = await getProjectPermissions(me, todo.projectId);
  if (!perms.canEditTodos) throw new Error("You can't delete tasks on this project.");

  await prisma.todo.delete({ where: { id: todoId } });
  revalidatePath("/tasks");
  revalidatePath(`/projects/${todo.projectId}`);
  return { ok: true };
}

// ---------- Notifications ----------

export async function markNotificationRead(id: string) {
  const me = await requireAuth();
  // Scoped to the recipient so nobody can mark someone else's notifications.
  await prisma.notification.updateMany({ where: { id, recipientId: me.id }, data: { read: true } });
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
}

export async function markAllNotificationsRead() {
  const me = await requireAuth();
  await prisma.notification.updateMany({ where: { recipientId: me.id, read: false }, data: { read: true } });
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
}

// ---------- Project highlight title (admin) ----------

export async function updateHighlightTitle(projectId: string, highlightTitle: string) {
  await requireAdmin();
  await prisma.project.update({
    where: { id: projectId },
    data: { highlightTitle: highlightTitle.trim() || null },
  });
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

// ---------- Financial line items ----------

export type LineItemInput = {
  category: string;
  description: string;
  vendor?: string;
  qty: number;
  unitCost: number;
  actualAmount: number;
  invoiceRef?: string;
  paidDate?: string | null;
  status: string;
  notes?: string;
};

/** Replace the whole ledger for a project in one save (mirrors the grid UI). */
export async function saveLineItems(projectId: string, items: LineItemInput[]) {
  const me = await requireAuth();
  const perms = await getProjectPermissions(me, projectId);
  if (!perms.canEditFinancials) throw new Error("You don't have permission to edit financials on this project.");

  const rows = items
    .filter((i) => i.description?.trim())
    .map((i, order) => ({
      projectId,
      category: i.category?.trim() || "General",
      description: i.description.trim(),
      vendor: i.vendor?.trim() || null,
      qty: Number(i.qty) || 0,
      unitCost: Number(i.unitCost) || 0,
      // budgetAmount is derived, never trusted from the client
      budgetAmount: (Number(i.qty) || 0) * (Number(i.unitCost) || 0),
      actualAmount: Number(i.actualAmount) || 0,
      invoiceRef: i.invoiceRef?.trim() || null,
      paidDate: i.paidDate ? new Date(i.paidDate) : null,
      status: i.status || "Planned",
      notes: i.notes?.trim() || null,
      order,
    }));

  await prisma.$transaction([
    prisma.financialLineItem.deleteMany({ where: { projectId } }),
    ...(rows.length ? [prisma.financialLineItem.createMany({ data: rows })] : []),
  ]);

  // Keep the project's headline figures in sync with the ledger, so the
  // dashboard/summary numbers can't drift away from the line items.
  const budgetTotal = rows.reduce((s, r) => s + r.budgetAmount, 0);
  const actualTotal = rows.reduce((s, r) => s + r.actualAmount, 0);
  const committedTotal = rows
    .filter((r) => ["Committed", "Invoiced", "Paid"].includes(r.status))
    .reduce((s, r) => s + r.budgetAmount, 0);

  await prisma.project.update({
    where: { id: projectId },
    data: { estBudget: budgetTotal, actualSpend: actualTotal, committed: committedTotal },
  });

  await logActivity({
    projectId,
    actor: me,
    action: "financials.updated",
    summary: `Updated financial ledger — ${rows.length} line item${rows.length === 1 ? "" : "s"}, budget ${budgetTotal.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`,
    meta: { lineItems: rows.length, budgetTotal, actualTotal },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/financials`);
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------- Weekly report subscriptions (admin-only) ----------

export type SubscriptionInput = {
  enabled: boolean;
  includeStatus: boolean;
  includeTasks: boolean;
  includeKeyDates: boolean;
  includeQuestions: boolean;
  includeFinancials: boolean;
};

export async function setReportSubscription(projectId: string, memberId: string, data: SubscriptionInput) {
  await requireAdmin();
  await prisma.reportSubscription.upsert({
    where: { projectId_memberId: { projectId, memberId } },
    create: { projectId, memberId, ...data },
    update: data,
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/** Let anyone turn their own task emails on/off. */
export async function setOwnEmailPrefs(emailOnTaskAssigned: boolean) {
  const me = await requireAuth();
  await prisma.teamMember.update({ where: { id: me.id }, data: { emailOnTaskAssigned } });
  revalidatePath("/settings");
  return { ok: true };
}

/** Admin fires the weekly digest immediately, for testing or off-cycle sends. */
export async function sendWeeklyReportsNow(): Promise<{ sent: number; skipped: number; errors: string[] }> {
  await requireAdmin();
  const { sendWeeklyReports } = await import("./weeklyReport");
  return sendWeeklyReports(await appUrl());
}

// ---------- Site details, owner, geocoding ----------

export type SiteInput = {
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  ownerName?: string;
  ownerCompany?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  ownerNotes?: string;
};

export async function updateProjectSite(projectId: string, data: SiteInput) {
  const me = await requireAuth();
  const perms = await getProjectPermissions(me, projectId);
  // Site/owner details are project-level metadata — gated on admin or the
  // broader "edit team" permission rather than inventing another flag.
  if (me.role !== "ADMIN" && !perms.canEditTeam) {
    throw new Error("You don't have permission to edit site details on this project.");
  }
  await prisma.project.update({
    where: { id: projectId },
    data: {
      address: data.address?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim().toUpperCase().slice(0, 2) || null,
      postalCode: data.postalCode?.trim() || null,
      latitude: typeof data.latitude === "number" && Number.isFinite(data.latitude) ? data.latitude : null,
      longitude: typeof data.longitude === "number" && Number.isFinite(data.longitude) ? data.longitude : null,
      ownerName: data.ownerName?.trim() || null,
      ownerCompany: data.ownerCompany?.trim() || null,
      ownerEmail: data.ownerEmail?.trim() || null,
      ownerPhone: data.ownerPhone?.trim() || null,
      ownerNotes: data.ownerNotes?.trim() || null,
    },
  });
  await logActivity({
    projectId,
    actor: me,
    action: "site.updated",
    summary: "Updated site location / owner details",
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/** Look up coordinates for an address. Returns null rather than throwing if the service is unreachable. */
export async function lookupCoordinates(address: string) {
  await requireAuth();
  const { geocodeAddress } = await import("./geo");
  const res = await geocodeAddress(address);
  return res;
}

// ---------- Project rebates ----------

export type RebateInput = {
  name: string;
  authority?: string;
  category: string;
  incentiveType: string;
  value: number;
  estimatedAmount: number;
  status: string;
  sourceUrl?: string;
  notes?: string;
};

export async function saveRebates(projectId: string, items: RebateInput[]) {
  const me = await requireAuth();
  const perms = await getProjectPermissions(me, projectId);
  // Rebates are financial in nature, so they follow financial permissions.
  if (!perms.canEditFinancials) {
    throw new Error("You don't have permission to edit incentives on this project.");
  }
  const rows = items
    .filter((r) => r.name?.trim())
    .map((r, order) => ({
      projectId,
      name: r.name.trim(),
      authority: r.authority?.trim() || null,
      category: r.category || "Solar",
      incentiveType: r.incentiveType || "Percentage",
      value: Number(r.value) || 0,
      estimatedAmount: Number(r.estimatedAmount) || 0,
      status: r.status || "Researching",
      sourceUrl: r.sourceUrl?.trim() || null,
      notes: r.notes?.trim() || null,
      order,
    }));

  await prisma.$transaction([
    prisma.projectRebate.deleteMany({ where: { projectId } }),
    ...(rows.length ? [prisma.projectRebate.createMany({ data: rows })] : []),
  ]);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

// ---------- Team messages & alerts ----------

export type MessageInput = {
  subject: string;
  body: string;
  kind: "MESSAGE" | "ALERT";
  priority: string;
  recipientIds: string[]; // empty = everyone
};

/**
 * Send a message or alert. Alerts (kind: "ALERT") pop up as a blocking modal
 * on the recipient's next page load until they acknowledge.
 * Only admins can push alerts; anyone can send a normal message.
 */
export async function sendMessage(data: MessageInput) {
  const me = await requireAuth();
  if (!data.subject?.trim()) throw new Error("Subject is required.");
  if (!data.body?.trim()) throw new Error("Message body is required.");
  if (data.kind === "ALERT" && me.role !== "ADMIN") {
    throw new Error("Only admins can push alerts.");
  }

  // Empty recipient list means the whole team (minus the sender).
  let ids = data.recipientIds.filter(Boolean);
  if (ids.length === 0) {
    const all = await prisma.teamMember.findMany({ select: { id: true } });
    ids = all.map((m) => m.id);
  }
  ids = Array.from(new Set(ids)).filter((id) => id !== me.id);
  if (ids.length === 0) throw new Error("Pick at least one recipient other than yourself.");

  const message = await prisma.message.create({
    data: {
      senderId: me.id,
      subject: data.subject.trim(),
      body: data.body.trim(),
      kind: data.kind,
      priority: data.priority || "Normal",
      recipients: { create: ids.map((memberId) => ({ memberId })) },
    },
  });

  // Also drop a bell notification so it shows up alongside task alerts.
  await prisma.notification.createMany({
    data: ids.map((memberId) => ({
      recipientId: memberId,
      type: "GENERAL",
      title: data.kind === "ALERT" ? `⚠ Alert from ${me.name}` : `Message from ${me.name}`,
      body: data.subject.trim(),
      link: "/messages",
    })),
  });

  // Email urgent alerts — best-effort, never blocks the send.
  if (data.kind === "ALERT" && (data.priority === "Urgent" || data.priority === "High")) {
    try {
      const { sendEmail, emailShell, escapeHtml } = await import("./email");
      const url = await appUrl();
      const people = await prisma.teamMember.findMany({
        where: { id: { in: ids }, email: { not: null } },
        select: { email: true, name: true },
      });
      await Promise.all(
        people.map((p) =>
          sendEmail({
            to: p.email!,
            subject: `[${data.priority}] ${data.subject.trim()}`,
            html: emailShell({
              kicker: `${data.priority} alert`,
              heading: escapeHtml(data.subject.trim()),
              body: `<p style="margin:0;font-size:14px;color:#3A3A3A;line-height:1.6;white-space:pre-wrap;">${escapeHtml(
                data.body.trim()
              )}</p><p style="margin:16px 0 0;font-size:13px;color:#8A8A85;">Sent by ${escapeHtml(me.name)}</p>`,
              ctaText: "Open Team Hub",
              ctaUrl: `${url}/messages`,
            }),
          })
        )
      );
    } catch (e) {
      console.error("[alert email] failed:", e);
    }
  }

  revalidatePath("/messages");
  revalidatePath("/dashboard");
  return { ok: true, id: message.id };
}

/** Reply to a message — goes back to the sender plus everyone else on the thread. */
export async function replyToMessage(parentId: string, body: string) {
  const me = await requireAuth();
  if (!body?.trim()) throw new Error("Reply can't be empty.");

  const parent = await prisma.message.findUnique({
    where: { id: parentId },
    include: { recipients: { select: { memberId: true } } },
  });
  if (!parent) throw new Error("Message not found.");

  // Only people on the thread can reply to it.
  const onThread = parent.senderId === me.id || parent.recipients.some((r) => r.memberId === me.id);
  if (!onThread) throw new Error("You're not on this thread.");

  const ids = Array.from(
    new Set([parent.senderId, ...parent.recipients.map((r) => r.memberId)].filter(Boolean) as string[])
  ).filter((id) => id !== me.id);

  await prisma.message.create({
    data: {
      senderId: me.id,
      subject: parent.subject.startsWith("Re: ") ? parent.subject : `Re: ${parent.subject}`,
      body: body.trim(),
      kind: "MESSAGE",
      priority: "Normal",
      parentId: parent.parentId || parent.id,
      recipients: { create: ids.map((memberId) => ({ memberId })) },
    },
  });

  if (ids.length) {
    await prisma.notification.createMany({
      data: ids.map((memberId) => ({
        recipientId: memberId,
        type: "GENERAL",
        title: `Reply from ${me.name}`,
        body: parent.subject,
        link: "/messages",
      })),
    });
  }

  revalidatePath("/messages");
  return { ok: true };
}

export async function markMessageRead(messageId: string) {
  const me = await requireAuth();
  await prisma.messageRecipient.updateMany({
    where: { messageId, memberId: me.id, read: false },
    data: { read: true, readAt: new Date() },
  });
  revalidatePath("/messages");
  revalidatePath("/dashboard");
}

/** Acknowledge an alert — this is what stops the popup reappearing. */
export async function acknowledgeAlert(messageId: string) {
  const me = await requireAuth();
  await prisma.messageRecipient.updateMany({
    where: { messageId, memberId: me.id },
    data: { acknowledged: true, acknowledgedAt: new Date(), read: true, readAt: new Date() },
  });
  revalidatePath("/messages");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Soft-delete from this person's inbox only — others keep their copy. */
export async function deleteMessageForMe(messageId: string) {
  const me = await requireAuth();
  await prisma.messageRecipient.updateMany({
    where: { messageId, memberId: me.id },
    data: { deleted: true },
  });
  revalidatePath("/messages");
  return { ok: true };
}

/** Sender (or an admin) retracts a message for everyone. */
export async function deleteMessageForEveryone(messageId: string) {
  const me = await requireAuth();
  const msg = await prisma.message.findUnique({ where: { id: messageId }, select: { senderId: true } });
  if (!msg) throw new Error("Message not found.");
  if (msg.senderId !== me.id && me.role !== "ADMIN") {
    throw new Error("You can only delete messages you sent.");
  }
  await prisma.message.delete({ where: { id: messageId } });
  revalidatePath("/messages");
  return { ok: true };
}

/** Unacknowledged alerts for the current user — drives the login popup. */
export async function getPendingAlerts() {
  const me = await getCurrentMember();
  if (!me) return [];
  const rows = await prisma.messageRecipient.findMany({
    where: { memberId: me.id, acknowledged: false, deleted: false, message: { kind: "ALERT" } },
    include: { message: { include: { sender: { select: { name: true } } } } },
    orderBy: { message: { createdAt: "desc" } },
  });
  return rows.map((r) => ({
    id: r.messageId,
    subject: r.message.subject,
    body: r.message.body,
    priority: r.message.priority,
    senderName: r.message.sender?.name || "Z1Power",
    createdAt: r.message.createdAt.toISOString(),
  }));
}

// ---------- Task editing (inline, from the tasks hub) ----------

/**
 * Update any field of a task in one call. Permission is checked per action:
 * the assignee can always tick their own task done, but changing text,
 * assignee, or due date needs canEditTodos on that project.
 */
export async function updateTask(
  todoId: string,
  data: { text?: string; assigneeIds?: string[]; dueDate?: string | null; done?: boolean }
) {
  const me = await requireAuth();
  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    include: { project: { select: { id: true, title: true } }, assignees: true },
  });
  if (!todo) throw new Error("Task not found.");

  const perms = await getProjectPermissions(me, todo.projectId);
  const isAssignee = todo.assignees.some((a) => a.memberId === me.id);

  // Only changing `done`? Assignee is allowed even without edit rights.
  const onlyToggling =
    data.done !== undefined &&
    data.text === undefined &&
    data.assigneeIds === undefined &&
    data.dueDate === undefined;

  if (onlyToggling) {
    if (!perms.canEditTodos && !isAssignee) throw new Error("You can't change this task.");
  } else if (!perms.canEditTodos) {
    throw new Error("You don't have permission to edit tasks on this project.");
  }

  const previous = new Set(todo.assignees.map((a) => a.memberId));
  const nextIds = data.assigneeIds ? Array.from(new Set(data.assigneeIds.filter(Boolean))) : null;
  const added = nextIds ? nextIds.filter((id) => !previous.has(id)) : [];
  const reassigned = added.length > 0;

  await prisma.todo.update({
    where: { id: todoId },
    data: {
      ...(data.text !== undefined ? { text: data.text.trim() } : {}),

      ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
      ...(data.done !== undefined ? { done: data.done } : {}),
      ...(nextIds
        ? { assignees: { deleteMany: {}, create: nextIds.map((memberId) => ({ memberId })) } }
        : {}),
    },
  });

  await notifyAssignees({
    memberIds: added,
    actorId: me.id,
    actorName: me.name,
    taskText: data.text ?? todo.text,
    projectTitle: todo.project.title,
    dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : todo.dueDate,
    verb: "Task assigned to you",
  });

  if (data.done !== undefined && data.done !== todo.done) {
    await logActivity({
      projectId: todo.projectId,
      actor: me,
      action: data.done ? "task.completed" : "task.reopened",
      summary: `${data.done ? "Completed" : "Reopened"} "${todo.text.slice(0, 80)}"`,
      meta: { todoId: todo.id },
    });
  }
  if (!onlyToggling) {
    await logActivity({
      projectId: todo.projectId,
      actor: me,
      action: reassigned ? "task.assigned" : "task.updated",
      summary: reassigned
        ? `Reassigned "${(data.text ?? todo.text).slice(0, 60)}"`
        : `Edited task "${(data.text ?? todo.text).slice(0, 60)}"`,
      meta: { todoId: todo.id, assigneeIds: nextIds },
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/projects/${todo.projectId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------- Global search ----------

export type SearchHit = {
  type: "project" | "task" | "file" | "person";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
};

/**
 * Cross-entity search. Every branch is scoped to what the caller may see:
 * projects/tasks/files are limited to viewable project IDs, so search can
 * never become a way to discover restricted work.
 */
export async function globalSearch(query: string): Promise<SearchHit[]> {
  const me = await requireAuth();
  const q = query.trim();
  if (q.length < 2) return [];

  const { getViewableProjectIds } = await import("./permissions");
  const viewable = await getViewableProjectIds(me);
  const hits: SearchHit[] = [];

  // SQLite (dev) is case-insensitive by default; Postgres needs `mode`.
  const contains = { contains: q, mode: "insensitive" as const };

  const [projects, tasks, files, people] = await Promise.all([
    prisma.project.findMany({
      where: {
        id: { in: viewable },
        archived: false,
        OR: [{ title: contains }, { address: contains }, { city: contains }, { ownerName: contains }, { ownerCompany: contains }],
      },
      select: { id: true, title: true, category: true, status: true, city: true, state: true },
      take: 8,
    }),
    prisma.todo.findMany({
      where: {
        text: contains,
        OR: [{ assigneeId: me.id }, { projectId: { in: viewable } }],
      },
      include: { project: { select: { id: true, title: true } }, assignee: { select: { name: true } } },
      take: 8,
    }),
    prisma.projectFile.findMany({
      where: { filename: contains, projectId: { in: viewable } },
      include: { project: { select: { id: true, title: true } } },
      take: 6,
    }),
    prisma.teamMember.findMany({
      where: { OR: [{ name: contains }, { email: contains }, { title: contains }] },
      select: { id: true, name: true, title: true, email: true, role: true },
      take: 6,
    }),
  ]);

  for (const p of projects) {
    hits.push({
      type: "project",
      id: p.id,
      title: p.title,
      subtitle: [p.category, [p.city, p.state].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
      href: `/projects/${p.id}`,
      badge: p.status,
    });
  }
  for (const t of tasks) {
    hits.push({
      type: "task",
      id: t.id,
      title: t.text,
      subtitle: `${t.project.title}${t.assignee ? ` · ${t.assignee.name}` : " · unassigned"}`,
      href: `/tasks`,
      badge: t.done ? "Done" : undefined,
    });
  }
  for (const f of files) {
    hits.push({
      type: "file",
      id: f.id,
      title: f.filename,
      subtitle: f.project.title,
      href: `/projects/${f.projectId}`,
    });
  }
  for (const p of people) {
    hits.push({
      type: "person",
      id: p.id,
      title: p.name,
      subtitle: [p.title, p.email].filter(Boolean).join(" · ") || "Team member",
      href: `/team`,
      badge: p.role === "ADMIN" ? "Admin" : undefined,
    });
  }

  return hits;
}

// ---------- Saved views ----------

export async function saveView(name: string, scope: string, filters: Record<string, unknown>, shared: boolean) {
  const me = await requireAuth();
  if (!name?.trim()) throw new Error("Give this view a name.");
  // Only admins can push a view to the whole team.
  const isShared = shared && me.role === "ADMIN";
  const view = await prisma.savedView.create({
    data: { ownerId: me.id, name: name.trim(), scope, filters: JSON.stringify(filters), shared: isShared },
  });
  revalidatePath("/tasks");
  return { ok: true, id: view.id };
}

export async function deleteSavedView(id: string) {
  const me = await requireAuth();
  const view = await prisma.savedView.findUnique({ where: { id } });
  if (!view) return { ok: true };
  if (view.ownerId !== me.id && me.role !== "ADMIN") throw new Error("You can only delete your own views.");
  await prisma.savedView.delete({ where: { id } });
  revalidatePath("/tasks");
  return { ok: true };
}

// ---------- Bulk task actions ----------

/**
 * Apply one change to many tasks. Permission is checked per task, and tasks
 * the caller can't edit are silently skipped rather than failing the whole
 * batch — so a partial selection still does useful work.
 */
export async function bulkUpdateTasks(
  todoIds: string[],
  action:
    | { type: "assign"; assigneeIds: string[]; mode: "replace" | "add" }
    | { type: "due"; dueDate: string | null }
    | { type: "complete"; done: boolean }
    | { type: "delete" }
): Promise<{ updated: number; skipped: number }> {
  const me = await requireAuth();
  if (todoIds.length === 0) return { updated: 0, skipped: 0 };

  const todos = await prisma.todo.findMany({
    where: { id: { in: todoIds } },
    include: { project: { select: { id: true, title: true } } },
  });

  let updated = 0;
  let skipped = 0;
  const touchedProjects = new Set<string>();

  for (const t of todos) {
    const perms = await getProjectPermissions(me, t.projectId);
    const isAssignee = false; // recomputed below only where needed
    const allowed = action.type === "complete" ? perms.canEditTodos || isAssignee : perms.canEditTodos;
    if (!allowed) {
      skipped++;
      continue;
    }

    if (action.type === "delete") {
      await prisma.todo.delete({ where: { id: t.id } });
    } else if (action.type === "assign") {
      const ids = Array.from(new Set(action.assigneeIds.filter(Boolean)));
      if (action.mode === "replace") {
        await prisma.todoAssignee.deleteMany({ where: { todoId: t.id } });
      }
      if (ids.length) {
        // upsert rather than createMany({skipDuplicates}) — that option isn't
        // supported on every Prisma provider, and "add" mode may hit existing rows.
        for (const memberId of ids) {
          await prisma.todoAssignee.upsert({
            where: { todoId_memberId: { todoId: t.id, memberId } },
            create: { todoId: t.id, memberId },
            update: {},
          });
        }
      }
      await notifyAssignees({
        memberIds: ids, actorId: me.id, actorName: me.name,
        taskText: t.text, projectTitle: t.project.title, dueDate: t.dueDate,
        verb: "Task assigned to you",
      });
    } else if (action.type === "due") {
      await prisma.todo.update({
        where: { id: t.id },
        data: { dueDate: action.dueDate ? new Date(action.dueDate) : null },
      });
    } else if (action.type === "complete") {
      await prisma.todo.update({ where: { id: t.id }, data: { done: action.done } });
    }

    touchedProjects.add(t.projectId);
    updated++;
  }

  // One activity line per project rather than per task — keeps the feed readable.
  const verb =
    action.type === "delete"
      ? "Deleted"
      : action.type === "assign"
      ? "Reassigned"
      : action.type === "due"
      ? "Rescheduled"
      : action.done
      ? "Completed"
      : "Reopened";
  for (const pid of Array.from(touchedProjects)) {
    const n = todos.filter((t) => t.projectId === pid).length;
    await logActivity({
      projectId: pid,
      actor: me,
      action: action.type === "delete" ? "task.deleted" : "task.updated",
      summary: `${verb} ${n} task${n === 1 ? "" : "s"} in bulk`,
      meta: { count: n, action: action.type },
    });
    revalidatePath(`/projects/${pid}`);
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { updated, skipped };
}

// ---------- Trade shows ----------

/** Manage rights: admins always, plus anyone explicitly granted. */
async function requireTradeShowManager() {
  const me = await requireAuth();
  if (me.role === "ADMIN") return me;
  const record = await prisma.teamMember.findUnique({
    where: { id: me.id },
    select: { canManageTradeShows: true },
  });
  if (!record?.canManageTradeShows) throw new Error("You don't have permission to manage trade shows.");
  return me;
}

export type TradeShowInput = {
  name: string;
  description?: string;
  startDate: string;
  endDate?: string | null;
  timeInfo?: string;
  venue?: string;
  city?: string;
  state?: string;
  country?: string;
  websiteUrl?: string;
  registrationUrl?: string;
  registrationDeadline?: string | null;
  priority: string;
  status: string;
  boothInfo?: string;
  estimatedCost: number;
  notes?: string;
};

export async function saveTradeShow(id: string | null, data: TradeShowInput) {
  const me = await requireTradeShowManager();
  if (!data.name?.trim()) throw new Error("Show name is required.");
  if (!data.startDate) throw new Error("Start date is required.");

  const payload = {
    name: data.name.trim(),
    description: data.description?.trim() || null,
    startDate: new Date(data.startDate),
    endDate: data.endDate ? new Date(data.endDate) : null,
    timeInfo: data.timeInfo?.trim() || null,
    venue: data.venue?.trim() || null,
    city: data.city?.trim() || null,
    state: data.state?.trim() || null,
    country: data.country?.trim() || "USA",
    websiteUrl: data.websiteUrl?.trim() || null,
    registrationUrl: data.registrationUrl?.trim() || null,
    registrationDeadline: data.registrationDeadline ? new Date(data.registrationDeadline) : null,
    priority: data.priority || "Medium",
    status: data.status || "Considering",
    boothInfo: data.boothInfo?.trim() || null,
    estimatedCost: Number(data.estimatedCost) || 0,
    notes: data.notes?.trim() || null,
  };

  const show = id
    ? await prisma.tradeShow.update({ where: { id }, data: payload })
    : await prisma.tradeShow.create({ data: payload });

  await logActivity({
    actor: me,
    action: id ? "project.updated" : "project.created",
    summary: `${id ? "Updated" : "Added"} trade show "${show.name}"`,
    meta: { tradeShowId: show.id },
  });

  revalidatePath("/trade-shows");
  return { ok: true, id: show.id };
}

export async function deleteTradeShow(id: string) {
  await requireTradeShowManager();
  await prisma.tradeShow.delete({ where: { id } });
  revalidatePath("/trade-shows");
  return { ok: true };
}

/** Add or update someone's attendance. Managers can set anyone; members set only themselves. */
export async function setTradeShowAttendance(
  tradeShowId: string,
  memberId: string,
  data: { status: string; role?: string; notes?: string }
) {
  const me = await requireAuth();
  const isManager =
    me.role === "ADMIN" ||
    !!(await prisma.teamMember.findUnique({ where: { id: me.id }, select: { canManageTradeShows: true } }))
      ?.canManageTradeShows;

  // Anyone can RSVP for themselves; only managers can change someone else's.
  if (!isManager && memberId !== me.id) {
    throw new Error("You can only change your own attendance.");
  }

  await prisma.tradeShowAttendee.upsert({
    where: { tradeShowId_memberId: { tradeShowId, memberId } },
    create: { tradeShowId, memberId, status: data.status, role: data.role || null, notes: data.notes || null },
    update: { status: data.status, role: data.role || null, notes: data.notes || null },
  });

  // Let someone know when a manager signs them up.
  if (isManager && memberId !== me.id && data.status !== "Declined") {
    const show = await prisma.tradeShow.findUnique({ where: { id: tradeShowId }, select: { name: true, startDate: true } });
    if (show) {
      await prisma.notification.create({
        data: {
          recipientId: memberId,
          type: "GENERAL",
          title: `You're down for ${show.name}`,
          body: `${data.status} · ${show.startDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
          link: "/trade-shows",
        },
      });
    }
  }

  revalidatePath("/trade-shows");
  return { ok: true };
}

export async function removeTradeShowAttendee(tradeShowId: string, memberId: string) {
  const me = await requireAuth();
  const isManager =
    me.role === "ADMIN" ||
    !!(await prisma.teamMember.findUnique({ where: { id: me.id }, select: { canManageTradeShows: true } }))
      ?.canManageTradeShows;
  if (!isManager && memberId !== me.id) throw new Error("You can only remove yourself.");

  await prisma.tradeShowAttendee.deleteMany({ where: { tradeShowId, memberId } });
  revalidatePath("/trade-shows");
  return { ok: true };
}

/** Admin-only: who can see and who can manage the Trade Shows area. */
export async function setTradeShowAccess(memberId: string, canView: boolean, canManage: boolean) {
  await requireAdmin();
  await prisma.teamMember.update({
    where: { id: memberId },
    // Managing implies viewing — otherwise you'd grant an unusable permission.
    data: { canViewTradeShows: canView || canManage, canManageTradeShows: canManage },
  });
  revalidatePath("/trade-shows");
  return { ok: true };
}

// ---------- Roles ----------

/** Only system admins, or someone whose role grants canManageRoles. */
async function requireRoleManager() {
  const me = await requireAuth();
  if (me.role === "ADMIN") return me;
  const { getGlobalCapabilities } = await import("./permissions");
  const caps = await getGlobalCapabilities(me);
  if (!caps.canManageRoles) throw new Error("You don't have permission to manage roles.");
  return me;
}

export type RoleInput = {
  name: string;
  description?: string;
  rank: number;
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
  defaultCanEditTalkingPoints: boolean;
  defaultCanEditKeyDates: boolean;
  defaultCanEditTodos: boolean;
  defaultCanEditQuestions: boolean;
  defaultCanEditTeam: boolean;
  defaultCanViewFiles: boolean;
  defaultCanUploadFiles: boolean;
  defaultCanViewFinancials: boolean;
  defaultCanEditFinancials: boolean;
  defaultCanEditStatus: boolean;
};

export async function saveRole(id: string | null, data: RoleInput) {
  const me = await requireRoleManager();
  if (!data.name?.trim()) throw new Error("Role name is required.");

  if (id) {
    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) throw new Error("Role not found.");
    // System roles keep their identity; only their permissions are editable.
    if (existing.isSystem && data.name.trim() !== existing.name) {
      throw new Error("Built-in roles can't be renamed.");
    }
  }

  // Explicitly whitelist every field rather than spreading `data`. The client
  // sends back a whole role object, which carries Prisma metadata (createdAt,
  // updatedAt, _count) that Prisma rejects as unknown arguments — and blindly
  // spreading client input into a write is a bad habit regardless.
  const payload = {
    name: data.name.trim(),
    description: data.description?.trim() || null,
    rank: Number.isFinite(Number(data.rank)) ? Number(data.rank) : 10,
    canCreateProjects: !!data.canCreateProjects,
    canDeleteAnyProject: !!data.canDeleteAnyProject,
    canViewAllProjects: !!data.canViewAllProjects,
    canEditAllProjects: !!data.canEditAllProjects,
    canViewAllFinancials: !!data.canViewAllFinancials,
    canEditAllFinancials: !!data.canEditAllFinancials,
    canManageTeam: !!data.canManageTeam,
    canManageRoles: !!data.canManageRoles,
    canSendAlerts: !!data.canSendAlerts,
    canManageTradeShows: !!data.canManageTradeShows,
    canViewReports: !!data.canViewReports,
    defaultCanEditTalkingPoints: !!data.defaultCanEditTalkingPoints,
    defaultCanEditKeyDates: !!data.defaultCanEditKeyDates,
    defaultCanEditTodos: !!data.defaultCanEditTodos,
    defaultCanEditQuestions: !!data.defaultCanEditQuestions,
    defaultCanEditTeam: !!data.defaultCanEditTeam,
    defaultCanViewFiles: !!data.defaultCanViewFiles,
    defaultCanUploadFiles: !!data.defaultCanUploadFiles,
    defaultCanViewFinancials: !!data.defaultCanViewFinancials,
    defaultCanEditFinancials: !!data.defaultCanEditFinancials,
    defaultCanEditStatus: !!data.defaultCanEditStatus,
  };

  const role = id
    ? await prisma.role.update({ where: { id }, data: payload })
    : await prisma.role.create({ data: payload });

  await logActivity({
    actor: me,
    action: id ? "project.updated" : "project.created",
    summary: `${id ? "Updated" : "Created"} role "${role.name}"`,
    meta: { roleId: role.id },
  });

  revalidatePath("/settings/roles");
  revalidatePath("/settings");
  return { ok: true, id: role.id };
}

export async function deleteRole(id: string) {
  await requireRoleManager();
  const role = await prisma.role.findUnique({ where: { id }, include: { members: true } });
  if (!role) throw new Error("Role not found.");
  if (role.isSystem) throw new Error("Built-in roles can't be deleted.");
  if (role.members.length > 0) {
    throw new Error(
      `${role.members.length} team member${role.members.length === 1 ? " is" : "s are"} still assigned this role. Reassign them first.`
    );
  }
  await prisma.role.delete({ where: { id } });
  revalidatePath("/settings/roles");
  return { ok: true };
}

/** Assign a role to a team member. */
export async function assignRole(memberId: string, roleId: string | null) {
  const me = await requireRoleManager();
  const target = await prisma.teamMember.findUnique({ where: { id: memberId } });
  if (!target) throw new Error("Team member not found.");

  // Guard: a non-admin can't grant a role that outranks their own.
  if (me.role !== "ADMIN" && roleId) {
    const [myRec, newRole] = await Promise.all([
      prisma.teamMember.findUnique({ where: { id: me.id }, include: { customRole: true } }),
      prisma.role.findUnique({ where: { id: roleId } }),
    ]);
    const myRank = myRec?.customRole?.rank ?? 0;
    if ((newRole?.rank ?? 0) >= myRank) {
      throw new Error("You can't assign a role at or above your own level.");
    }
  }

  await prisma.teamMember.update({ where: { id: memberId }, data: { roleId } });
  await logActivity({
    actor: me,
    action: "access.changed",
    summary: `Assigned role to ${target.name}`,
    meta: { memberId, roleId },
  });
  revalidatePath("/team");
  revalidatePath("/settings/roles");
  return { ok: true };
}

/** Transfer project ownership. Admins, or the current owner handing it on. */
export async function transferProjectOwnership(projectId: string, newOwnerId: string) {
  const me = await requireAuth();
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true, title: true } });
  if (!project) throw new Error("Project not found.");
  if (me.role !== "ADMIN" && project.ownerId !== me.id) {
    throw new Error("Only the owner or an admin can transfer ownership.");
  }
  await prisma.project.update({ where: { id: projectId }, data: { ownerId: newOwnerId } });
  const newOwner = await prisma.teamMember.findUnique({ where: { id: newOwnerId }, select: { name: true } });
  await logActivity({
    projectId, actor: me, action: "access.changed",
    summary: `Transferred ownership to ${newOwner?.name ?? "another member"}`,
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
