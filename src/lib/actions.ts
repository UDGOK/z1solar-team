"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getCurrentMember } from "./auth";
import { setWhatsAppLink } from "./settings";
import { getProjectPermissions } from "./permissions";
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
  todos: { text: string; done: boolean; assigneeId: string | null; dueDate: string | null }[];
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
  await requireAdmin(); // only admins create projects
  if (!data.title?.trim()) throw new Error("Project title is required.");

  const project = await prisma.project.create({
    data: {
      title: data.title.trim(),
      category: data.category,
      leadId: data.leadId || null,
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
            assigneeId: t.assigneeId || null,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
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
      todos: { orderBy: { order: "asc" } },
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
          assigneeId: t.assigneeId || null,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
        }))
    : existing.todos.map((t, order) => ({
        text: t.text,
        done: t.done,
        order,
        assigneeId: t.assigneeId,
        dueDate: t.dueDate,
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
  const todo = await prisma.todo.findUnique({ where: { id: todoId }, select: { projectId: true, assigneeId: true } });
  if (!todo) throw new Error("Task not found.");
  const perms = await getProjectPermissions(member, todo.projectId);
  const isAssignee = todo.assigneeId === member.id;
  if (!perms.canView) throw new Error("You don't have access to this project.");
  if (!perms.canEditTodos && !isAssignee) throw new Error("You can't change this task.");

  await prisma.todo.update({ where: { id: todoId }, data: { done } });
  revalidatePath(`/projects/${todo.projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/my-tasks");
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
  await requireAdmin();
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

  const { loadProjectForPdf, renderProjectSummaryPdf, pdfFilename } = await import("@/lib/pdf/render");
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
  const h = headers();
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

/**
 * Create a task from anywhere (My Tasks, project page). The assignee does NOT
 * need project access — assigning a task is itself the grant to see that task.
 * Anyone who can edit todos on the project, or an admin, can create one.
 */
export async function createTask(data: {
  projectId: string;
  text: string;
  assigneeId: string | null;
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
      assigneeId: data.assigneeId || null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      createdById: me.id,
      order: (maxOrder._max.order ?? -1) + 1,
    },
    include: { project: { select: { title: true } } },
  });

  // Notify the assignee (unless they assigned it to themselves).
  if (todo.assigneeId && todo.assigneeId !== me.id) {
    await prisma.notification.create({
      data: {
        recipientId: todo.assigneeId,
        type: "TASK_ASSIGNED",
        title: `New task from ${me.name}`,
        body: `${todo.text} — ${todo.project.title}`,
        link: `/my-tasks`,
      },
    });
  }

  revalidatePath("/my-tasks");
  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Reassign an existing task, notifying the new assignee. */
export async function reassignTask(todoId: string, assigneeId: string | null) {
  const me = await requireAuth();
  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    include: { project: { select: { title: true } } },
  });
  if (!todo) throw new Error("Task not found.");
  const perms = await getProjectPermissions(me, todo.projectId);
  if (!perms.canEditTodos) throw new Error("You can't reassign tasks on this project.");

  await prisma.todo.update({ where: { id: todoId }, data: { assigneeId: assigneeId || null } });

  if (assigneeId && assigneeId !== me.id && assigneeId !== todo.assigneeId) {
    await prisma.notification.create({
      data: {
        recipientId: assigneeId,
        type: "TASK_ASSIGNED",
        title: `Task assigned to you by ${me.name}`,
        body: `${todo.text} — ${todo.project.title}`,
        link: `/my-tasks`,
      },
    });
  }

  revalidatePath("/my-tasks");
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
  revalidatePath("/my-tasks");
  revalidatePath(`/projects/${todo.projectId}`);
  return { ok: true };
}

// ---------- Notifications ----------

export async function markNotificationRead(id: string) {
  const me = await requireAuth();
  // Scoped to the recipient so nobody can mark someone else's notifications.
  await prisma.notification.updateMany({ where: { id, recipientId: me.id }, data: { read: true } });
  revalidatePath("/dashboard");
  revalidatePath("/my-tasks");
}

export async function markAllNotificationsRead() {
  const me = await requireAuth();
  await prisma.notification.updateMany({ where: { recipientId: me.id, read: false }, data: { read: true } });
  revalidatePath("/dashboard");
  revalidatePath("/my-tasks");
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
