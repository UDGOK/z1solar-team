"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { getCurrentMember } from "./auth";
import { setWhatsAppLink } from "./settings";
import { getProjectPermissions } from "./permissions";
import { logActivity } from "./activity";
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
  const createdMember = await prisma.teamMember.create({
    data: {
      name: data.name.trim(),
      title: data.title?.trim() || null,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
    },
  });

  // A new member with a phone number can text in immediately, so mirror them
  // into the approved list right away.
  await syncTeamPhoneToSms(createdMember.id);

  revalidatePath("/team");
  revalidatePath("/dashboard");
  revalidatePath("/sms");
}

/**
 * Mirrors a team member's phone into the approved SMS list. They could always
 * text in (sender matching checks TeamMember.phone first), but without this
 * the Approved numbers screen looked incomplete, which made the allowlist
 * impossible to audit at a glance.
 */
async function syncTeamPhoneToSms(memberId: string) {
  try {
    const m = await prisma.teamMember.findUnique({ where: { id: memberId } });
    if (!m) return;
    const { normalizePhone } = await import("./sms/twilio");
    const phone = normalizePhone(m.phone);
    if (!phone) return;
    const existing = await prisma.smsContact.findUnique({ where: { phone } });
    if (existing) {
      if (existing.name !== m.name) {
        await prisma.smsContact.update({ where: { id: existing.id }, data: { name: m.name } });
      }
      return;
    }
    await prisma.smsContact.create({
      data: { phone, name: m.name, company: "Z1Power (team)", active: true, notes: "Synced from team directory" },
    });
  } catch (e) {
    console.error("[sms] team phone sync failed:", e);
  }
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
  // Keep the approved SMS list truthful when someone's number changes.
  await syncTeamPhoneToSms(id);

  revalidatePath("/team");
  revalidatePath("/dashboard");
  revalidatePath("/sms");
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
  // Snapshot before the write so the audit trail can show what moved.
  const auditBefore = await prisma.project.findUnique({ where: { id } });
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

  // Record what actually changed. Financial fields are flagged so a money
  // review can filter to just those.
  if (auditBefore) {
    const after = await prisma.project.findUnique({ where: { id } });
    if (after) {
      const { auditUpdate } = await import("./audit");
      await auditUpdate({
        entityType: "Project",
        entityId: id,
        entityLabel: after.title,
        actor: { id: member.id, name: member.name, email: member.email },
        before: auditBefore,
        after,
        only: [
          "title", "category", "status", "completionPct", "priority",
          "estBudget", "committed", "actualSpend",
          "q1Proj", "q2Proj", "q3Proj", "q4Proj",
          "leadId", "ownerId", "archived",
        ],
      });
    }
  }

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

  // Loaded on demand so @react-pdf isn't pulled into every page that imports
  // this server-actions module. Safe as a dynamic import because react-pdf is
  // listed in serverExternalPackages, so Node resolves one shared instance.
  const { loadProjectForPdf, renderProjectSummaryPdf, pdfFilename } = await import("@/lib/pdf/render");
  const { put } = await import("@vercel/blob");

  const project = await loadProjectForPdf(projectId);
  if (!project) throw new Error("Project not found.");

  const buffer = await renderProjectSummaryPdf(project);
  const filename = pdfFilename(project.title);

  // Blob storage is Private — a raw blob URL doesn't work for someone
  // outside the app. Instead we store the PDF privately and hand out our
  // own token-based link: possession of the unguessable token is what
  // grants access (same security property as an unlisted public URL), and
  // unlike a raw blob URL we can expire it.
  const blob = await put(`summaries/${filename}`, buffer, {
    access: "private",
    addRandomSuffix: true,
    contentType: "application/pdf",
  });

  const crypto = await import("crypto");
  const token = crypto.randomBytes(24).toString("hex");
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  await prisma.sharedLink.create({
    data: {
      token,
      pathname: blob.pathname,
      filename,
      contentType: "application/pdf",
      projectId,
      expiresAt: new Date(Date.now() + THIRTY_DAYS),
    },
  });

  const base = await appUrl();
  return { url: `${base}/api/shared/${token}` };
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
  canManageCategories: boolean;
  canViewMeetings: boolean;
  canManageMeetings: boolean;
  canTakeMeetingNotes: boolean;
  canViewResources: boolean;
  canManageResources: boolean;
  canViewSms: boolean;
  canSendSms: boolean;
  canManageSmsContacts: boolean;
  canRequestPurchases: boolean;
  canApprovePurchases: boolean;
  canViewAllPurchases: boolean;
  canRecordPayments: boolean;
  canViewAuditLog: boolean;
  canRestoreBackup: boolean;
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
    canManageCategories: !!data.canManageCategories,
    canViewMeetings: !!data.canViewMeetings,
    canManageMeetings: !!data.canManageMeetings,
    canTakeMeetingNotes: !!data.canTakeMeetingNotes,
    canViewResources: !!data.canViewResources,
    canManageResources: !!data.canManageResources,
    canViewSms: !!data.canViewSms,
    canSendSms: !!data.canSendSms,
    canManageSmsContacts: !!data.canManageSmsContacts,
    canRequestPurchases: !!data.canRequestPurchases,
    canApprovePurchases: !!data.canApprovePurchases,
    canViewAllPurchases: !!data.canViewAllPurchases,
    canRecordPayments: !!data.canRecordPayments,
    canViewAuditLog: !!data.canViewAuditLog,
    canRestoreBackup: !!data.canRestoreBackup,
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

// ---------- Inline quick-edit (dashboard cards) ----------

/**
 * Rename a project and/or set its priority, without going through the full
 * project form. Deliberately narrow: it only ever writes these two fields, so
 * a quick edit can't accidentally clobber financials, dates, or team data the
 * way a full-form save could if the client sent stale values.
 */
export async function quickUpdateProject(
  projectId: string,
  data: { title?: string; priority?: string }
) {
  const me = await requireAuth();
  const perms = await getProjectPermissions(me, projectId);

  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    select: { title: true, priority: true },
  });
  if (!existing) throw new Error("Project not found.");

  // Renaming is an admin/owner-level change; priority is lighter-touch and
  // follows the same permission as editing status.
  const isAdmin = me.role === "ADMIN";
  const owner = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  const isOwner = owner?.ownerId === me.id;

  const patch: { title?: string; priority?: string } = {};

  if (data.title !== undefined) {
    if (!isAdmin && !isOwner) throw new Error("Only an admin or the project owner can rename a project.");
    const t = data.title.trim();
    if (!t) throw new Error("Project name can't be empty.");
    if (t.length > 120) throw new Error("Project name is too long (120 characters max).");
    patch.title = t;
  }

  if (data.priority !== undefined) {
    if (!isAdmin && !isOwner && !perms.canEditStatus) {
      throw new Error("You don't have permission to change priority on this project.");
    }
    if (!["High", "Medium", "Low"].includes(data.priority)) {
      throw new Error("Priority must be High, Medium, or Low.");
    }
    patch.priority = data.priority;
  }

  if (Object.keys(patch).length === 0) return { ok: true };

  await prisma.project.update({ where: { id: projectId }, data: patch });

  const bits: string[] = [];
  if (patch.title && patch.title !== existing.title) bits.push(`renamed to "${patch.title}"`);
  if (patch.priority && patch.priority !== existing.priority) {
    bits.push(`priority ${existing.priority} → ${patch.priority}`);
  }
  if (bits.length) {
    await logActivity({
      projectId,
      actor: me,
      action: "project.updated",
      summary: bits.join(", "),
      meta: { from: existing, to: patch },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/**
 * Delete from a list view. Same permission rules as deleteProject, but returns
 * instead of redirecting — the caller stays on the projects page and the row
 * disappears.
 */
export async function deleteProjectFromList(id: string) {
  const me = await requireAuth();
  const { getGlobalCapabilities } = await import("./permissions");
  const [proj, caps] = await Promise.all([
    prisma.project.findUnique({ where: { id }, select: { ownerId: true, title: true } }),
    getGlobalCapabilities(me),
  ]);
  if (!proj) throw new Error("Project not found.");

  const allowed = me.role === "ADMIN" || caps.canDeleteAnyProject || proj.ownerId === me.id;
  if (!allowed) throw new Error("You can only delete projects you own.");

  await prisma.project.delete({ where: { id } });

  await logActivity({
    actor: me,
    action: "project.updated",
    summary: `Deleted project "${proj.title}"`,
    meta: { projectId: id },
  });

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------- Project categories ----------

async function requireCategoryManager() {
  const me = await requireAuth();
  if (me.role === "ADMIN") return me;
  const { getGlobalCapabilities } = await import("./permissions");
  const caps = await getGlobalCapabilities(me);
  if (!caps.canManageCategories) throw new Error("You don't have permission to manage categories.");
  return me;
}

export async function saveCategory(id: string | null, data: { name: string; color: string; order: number }) {
  const me = await requireCategoryManager();
  const name = data.name.trim();
  if (!name) throw new Error("Category name is required.");

  if (id) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new Error("Category not found.");

    // Rename must move every project onto the new name at the same time —
    // Project.category is a string, so an un-paired rename would orphan them.
    if (existing.name !== name) {
      const clash = await prisma.category.findFirst({ where: { name, NOT: { id } } });
      if (clash) throw new Error(`A category called "${name}" already exists.`);
      await prisma.$transaction([
        prisma.category.update({ where: { id }, data: { name, color: data.color, order: data.order } }),
        prisma.project.updateMany({ where: { category: existing.name }, data: { category: name } }),
      ]);
      await logActivity({ actor: me, action: "project.updated", summary: `Renamed category "${existing.name}" to "${name}"` });
    } else {
      await prisma.category.update({ where: { id }, data: { color: data.color, order: data.order } });
    }
  } else {
    const clash = await prisma.category.findFirst({ where: { name } });
    if (clash) throw new Error(`A category called "${name}" already exists.`);
    await prisma.category.create({ data: { name, color: data.color, order: data.order } });
    await logActivity({ actor: me, action: "project.created", summary: `Created category "${name}"` });
  }

  revalidatePath("/settings/categories");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Delete a category. Optionally move its projects to another one first. */
export async function deleteCategory(id: string, reassignTo?: string) {
  const me = await requireCategoryManager();
  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat) throw new Error("Category not found.");

  const inUse = await prisma.project.count({ where: { category: cat.name } });
  if (inUse > 0) {
    if (!reassignTo) {
      throw new Error(
        `${inUse} project${inUse === 1 ? " is" : "s are"} still in "${cat.name}". Choose a category to move them to first.`
      );
    }
    const target = await prisma.category.findUnique({ where: { id: reassignTo } });
    if (!target) throw new Error("The category you chose to move them to no longer exists.");
    await prisma.$transaction([
      prisma.project.updateMany({ where: { category: cat.name }, data: { category: target.name } }),
      prisma.category.delete({ where: { id } }),
    ]);
    await logActivity({ actor: me, action: "project.updated", summary: `Deleted category "${cat.name}", moved ${inUse} project(s) to "${target.name}"` });
  } else {
    await prisma.category.delete({ where: { id } });
    await logActivity({ actor: me, action: "project.updated", summary: `Deleted empty category "${cat.name}"` });
  }

  revalidatePath("/settings/categories");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------- Meetings ----------

async function meetingRights(memberId: string, isAdmin: boolean, meetingId?: string) {
  const { getGlobalCapabilities } = await import("./permissions");
  const me = { id: memberId, role: isAdmin ? "ADMIN" : "MEMBER" } as any;
  const caps = await getGlobalCapabilities(me);
  let canEditNotes = isAdmin || caps.canTakeMeetingNotes;
  let isOrganizer = false;
  if (meetingId) {
    const m = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { organizerId: true } });
    isOrganizer = m?.organizerId === memberId;
    if (!canEditNotes) {
      const att = await prisma.meetingAttendee.findUnique({
        where: { meetingId_memberId: { meetingId, memberId } },
      });
      canEditNotes = !!att?.canEditNotes;
    }
  }
  return {
    canView: isAdmin || caps.canViewMeetings,
    canManage: isAdmin || caps.canManageMeetings || isOrganizer,
    canEditNotes: canEditNotes || isAdmin || isOrganizer,
  };
}

export type MeetingInput = {
  title: string;
  description?: string;
  startsAt: string;
  durationMins: number;
  location?: string;
  joinUrl?: string;
  projectId?: string | null;
  status?: string;
};

export async function saveMeeting(id: string | null, data: MeetingInput) {
  const me = await requireAuth();
  const rights = await meetingRights(me.id, me.role === "ADMIN", id ?? undefined);
  if (!rights.canManage) throw new Error("You don't have permission to manage meetings.");
  if (!data.title?.trim()) throw new Error("Meeting title is required.");
  if (!data.startsAt) throw new Error("Date and time are required.");

  const payload = {
    title: data.title.trim(),
    description: data.description?.trim() || null,
    startsAt: new Date(data.startsAt),
    durationMins: Number(data.durationMins) || 60,
    location: data.location?.trim() || null,
    joinUrl: data.joinUrl?.trim() || null,
    projectId: data.projectId || null,
    ...(data.status ? { status: data.status } : {}),
  };

  const meeting = id
    ? await prisma.meeting.update({ where: { id }, data: payload })
    : await prisma.meeting.create({ data: { ...payload, organizerId: me.id } });

  await logActivity({
    actor: me,
    action: id ? "project.updated" : "project.created",
    summary: `${id ? "Updated" : "Scheduled"} meeting "${meeting.title}"`,
    meta: { meetingId: meeting.id },
  });

  revalidatePath("/meetings");
  return { ok: true, id: meeting.id };
}

export async function deleteMeeting(id: string) {
  const me = await requireAuth();
  const rights = await meetingRights(me.id, me.role === "ADMIN", id);
  if (!rights.canManage) throw new Error("You don't have permission to delete this meeting.");
  await prisma.meeting.delete({ where: { id } });
  revalidatePath("/meetings");
  return { ok: true };
}

export async function setMeetingAttendees(meetingId: string, memberIds: string[]) {
  const me = await requireAuth();
  const rights = await meetingRights(me.id, me.role === "ADMIN", meetingId);
  if (!rights.canManage) throw new Error("You don't have permission to change attendees.");

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { title: true, startsAt: true } });
  const next = Array.from(new Set(memberIds.filter(Boolean)));
  const existing = await prisma.meetingAttendee.findMany({ where: { meetingId } });
  const previous = new Set(existing.map((a) => a.memberId));
  const added = next.filter((x) => !previous.has(x));

  await prisma.$transaction([
    prisma.meetingAttendee.deleteMany({ where: { meetingId, memberId: { notIn: next.length ? next : ["__none__"] } } }),
    ...next.filter((x) => !previous.has(x)).map((memberId) =>
      prisma.meetingAttendee.create({ data: { meetingId, memberId } })
    ),
  ]);

  if (meeting && added.length) {
    await prisma.notification.createMany({
      data: added
        .filter((x) => x !== me.id)
        .map((recipientId) => ({
          recipientId,
          type: "GENERAL",
          title: `You're invited: ${meeting.title}`,
          body: meeting.startsAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }),
          link: "/meetings",
        })),
    });
  }

  revalidatePath("/meetings");
  return { ok: true };
}

/** Anyone invited can set their own RSVP; organisers/admins can set anyone's. */
export async function setMeetingRsvp(meetingId: string, memberId: string, status: string) {
  const me = await requireAuth();
  const rights = await meetingRights(me.id, me.role === "ADMIN", meetingId);
  if (memberId !== me.id && !rights.canManage) {
    throw new Error("You can only change your own RSVP.");
  }
  if (!["Invited", "Accepted", "Declined", "Attended"].includes(status)) {
    throw new Error("Invalid RSVP status.");
  }
  await prisma.meetingAttendee.upsert({
    where: { meetingId_memberId: { meetingId, memberId } },
    create: { meetingId, memberId, status },
    update: { status },
  });
  revalidatePath("/meetings");
  return { ok: true };
}

/** Per-meeting note-taking rights, so an admin can delegate for one meeting. */
export async function setMeetingNoteTaker(meetingId: string, memberId: string, canEditNotes: boolean) {
  const me = await requireAuth();
  const rights = await meetingRights(me.id, me.role === "ADMIN", meetingId);
  if (!rights.canManage) throw new Error("You don't have permission to assign note takers.");
  await prisma.meetingAttendee.upsert({
    where: { meetingId_memberId: { meetingId, memberId } },
    create: { meetingId, memberId, canEditNotes },
    update: { canEditNotes },
  });
  revalidatePath("/meetings");
  return { ok: true };
}

export async function saveMeetingNotes(meetingId: string, notes: string) {
  const me = await requireAuth();
  const rights = await meetingRights(me.id, me.role === "ADMIN", meetingId);
  if (!rights.canEditNotes) throw new Error("You don't have permission to write notes for this meeting.");
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { notes: notes.trim() || null, notesBy: me.name, notesAt: new Date(), status: "Held" },
  });
  await logActivity({ actor: me, action: "project.updated", summary: "Added meeting notes", meta: { meetingId } });
  revalidatePath("/meetings");
  return { ok: true };
}

export async function saveAgendaItems(meetingId: string, items: { text: string; ownerId?: string | null }[]) {
  const me = await requireAuth();
  const rights = await meetingRights(me.id, me.role === "ADMIN", meetingId);
  if (!rights.canManage) throw new Error("You don't have permission to edit this agenda.");
  const clean = items.filter((i) => i.text.trim());
  await prisma.$transaction([
    prisma.meetingAgendaItem.deleteMany({ where: { meetingId } }),
    ...clean.map((i, order) =>
      prisma.meetingAgendaItem.create({
        data: { meetingId, text: i.text.trim(), order, ownerId: i.ownerId || null },
      })
    ),
  ]);
  revalidatePath("/meetings");
  return { ok: true };
}

/** Ticking agenda items during a meeting — deliberately open to attendees. */
export async function toggleAgendaItem(itemId: string, covered: boolean) {
  const me = await requireAuth();
  const item = await prisma.meetingAgendaItem.findUnique({ where: { id: itemId }, select: { meetingId: true } });
  if (!item) throw new Error("Agenda item not found.");
  const rights = await meetingRights(me.id, me.role === "ADMIN", item.meetingId);
  const isAttendee = await prisma.meetingAttendee.findUnique({
    where: { meetingId_memberId: { meetingId: item.meetingId, memberId: me.id } },
  });
  if (!rights.canManage && !rights.canEditNotes && !isAttendee) {
    throw new Error("Only attendees can tick off agenda items.");
  }
  await prisma.meetingAgendaItem.update({ where: { id: itemId }, data: { covered } });
  revalidatePath("/meetings");
  return { ok: true };
}

// ---------- Resources ----------

async function requireResourceManager() {
  const me = await requireAuth();
  if (me.role === "ADMIN") return me;
  const { getGlobalCapabilities } = await import("./permissions");
  const caps = await getGlobalCapabilities(me);
  if (!caps.canManageResources) throw new Error("You don't have permission to manage resources.");
  return me;
}

export async function saveResourceCategory(
  id: string | null,
  data: { name: string; description?: string; icon: string; color: string; order: number }
) {
  await requireResourceManager();
  const name = data.name.trim();
  if (!name) throw new Error("Category name is required.");
  const payload = {
    name,
    description: data.description?.trim() || null,
    icon: data.icon || "folder",
    color: data.color || "#4CAB3E",
    order: Number(data.order) || 0,
  };
  if (id) await prisma.resourceCategory.update({ where: { id }, data: payload });
  else await prisma.resourceCategory.create({ data: payload });
  revalidatePath("/resources");
  return { ok: true };
}

export async function deleteResourceCategory(id: string) {
  await requireResourceManager();
  const cat = await prisma.resourceCategory.findUnique({ where: { id }, include: { items: true } });
  if (!cat) throw new Error("Category not found.");
  if (cat.items.length > 0) {
    throw new Error(`"${cat.name}" still has ${cat.items.length} item(s). Remove or move them first.`);
  }
  await prisma.resourceCategory.delete({ where: { id } });
  revalidatePath("/resources");
  return { ok: true };
}

export async function saveResource(
  id: string | null,
  data: {
    categoryId: string;
    title: string;
    description?: string;
    kind: string;
    url?: string;
    pathname?: string;
    filename?: string;
    contentType?: string;
    size?: number;
    tags?: string;
  }
) {
  const me = await requireResourceManager();
  if (!data.title?.trim()) throw new Error("Title is required.");
  if (data.kind === "LINK" && !data.url?.trim()) throw new Error("A link resource needs a URL.");
  if (data.kind === "FILE" && !id && !data.pathname) throw new Error("Upload a file first.");

  const payload = {
    categoryId: data.categoryId,
    title: data.title.trim(),
    description: data.description?.trim() || null,
    kind: data.kind,
    url: data.url?.trim() || null,
    pathname: data.pathname || null,
    filename: data.filename || null,
    contentType: data.contentType || null,
    size: data.size ?? 0,
    tags: data.tags?.trim() || null,
  };

  if (id) await prisma.resource.update({ where: { id }, data: payload });
  else await prisma.resource.create({ data: { ...payload, uploadedById: me.id } });

  revalidatePath("/resources");
  return { ok: true };
}

export async function deleteResource(id: string) {
  await requireResourceManager();
  await prisma.resource.delete({ where: { id } });
  revalidatePath("/resources");
  return { ok: true };
}

// ---------- SMS ----------

async function requireSmsSender() {
  const me = await requireAuth();
  if (me.role === "ADMIN") return me;
  const { getGlobalCapabilities } = await import("./permissions");
  const caps = await getGlobalCapabilities(me);
  if (!caps.canSendSms) throw new Error("You don't have permission to send text messages.");
  return me;
}

async function requireSmsContactManager() {
  const me = await requireAuth();
  if (me.role === "ADMIN") return me;
  const { getGlobalCapabilities } = await import("./permissions");
  const caps = await getGlobalCapabilities(me);
  if (!caps.canManageSmsContacts) throw new Error("You don't have permission to manage SMS contacts.");
  return me;
}

/** Approve an outside number (sub, vendor, inspector) to text in. */
export async function saveSmsContact(
  id: string | null,
  data: { phone: string; name: string; company?: string; notes?: string; active: boolean; projectIds?: string[] }
) {
  const me = await requireSmsContactManager();
  const { normalizePhone } = await import("./sms/twilio");
  const phone = normalizePhone(data.phone);
  if (!phone) throw new Error("Enter a valid phone number.");
  if (!data.name?.trim()) throw new Error("Name is required.");

  const clash = await prisma.smsContact.findFirst({
    where: { phone, ...(id ? { NOT: { id } } : {}) },
  });
  if (clash) throw new Error(`${clash.name} is already approved with that number.`);

  const payload = {
    phone,
    name: data.name.trim(),
    company: data.company?.trim() || null,
    notes: data.notes?.trim() || null,
    active: data.active,
    projectIds: data.projectIds?.length ? data.projectIds.join(",") : null,
  };

  if (id) await prisma.smsContact.update({ where: { id }, data: payload });
  else await prisma.smsContact.create({ data: { ...payload, createdById: me.id } });

  revalidatePath("/sms");
  return { ok: true };
}

export async function deleteSmsContact(id: string) {
  await requireSmsContactManager();
  await prisma.smsContact.delete({ where: { id } });
  revalidatePath("/sms");
  return { ok: true };
}

/** Send a text from inside the app, optionally tied to a project. */
export async function sendProjectSms(data: { to: string; body: string; projectId?: string | null }) {
  const me = await requireSmsSender();
  if (!data.body?.trim()) throw new Error("Message can't be empty.");

  if (data.projectId) {
    const perms = await getProjectPermissions(me, data.projectId);
    if (!perms.canView) throw new Error("You don't have access to that project.");
  }

  const { sendSms } = await import("./sms/send");
  const { normalizePhone } = await import("./sms/twilio");
  const to = normalizePhone(data.to);
  if (!to) throw new Error("Enter a valid phone number.");

  const member = await prisma.teamMember.findFirst({ where: { phone: { not: null } } });
  const members = await prisma.teamMember.findMany({ select: { id: true, phone: true } });
  const matched = members.find((m) => normalizePhone(m.phone) === to);

  const res = await sendSms({
    to,
    body: data.body.trim(),
    projectId: data.projectId ?? null,
    memberId: matched?.id ?? null,
  });

  if (!res.ok) throw new Error(res.skipped || res.error || "Couldn't send the message.");

  revalidatePath("/sms");
  if (data.projectId) revalidatePath(`/projects/${data.projectId}`);
  return { ok: true };
}

/** File an unrouted message against a project after the fact. */
export async function assignSmsToProject(smsId: string, projectId: string) {
  const me = await requireAuth();
  const perms = await getProjectPermissions(me, projectId);
  if (!perms.canView) throw new Error("You don't have access to that project.");

  const msg = await prisma.smsMessage.update({
    where: { id: smsId },
    data: { projectId, routedBy: "manual", handled: true },
  });

  // Open a session so their follow-up texts route themselves.
  const { openSession } = await import("./sms/router");
  if (msg.direction === "IN") await openSession(msg.fromNumber, projectId);

  revalidatePath("/sms");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

// ---------- Meeting import -> tasks ----------

/** Parse pasted notes into review-ready suggestions. Creates nothing yet. */
export async function createMeetingImport(data: {
  title: string;
  rawText: string;
  projectId?: string | null;
  meetingId?: string | null;
  source?: string;
}) {
  const me = await requireAuth();
  if (!data.rawText?.trim()) throw new Error("Paste the meeting notes first.");
  if (data.projectId) {
    const perms = await getProjectPermissions(me, data.projectId);
    if (!perms.canEditTodos) throw new Error("You can't create tasks on that project.");
  }

  const roster = await prisma.teamMember.findMany({ select: { id: true, name: true } });
  const { extractActionItems, namesToIds, extractDueDate } = await import("./meetingExtract");

  // Rules run first and always succeed — this is the floor.
  const ruleItems = extractActionItems(data.rawText, roster);

  // AI is an enhancement layered on top. Any failure returns null and we keep
  // the rule-based result, so a slow or broken API never blocks an import.
  const { aiExtract, mergeExtractions, isAiConfigured } = await import("./ai/deepseek");
  let ai = null;
  let aiError: string | null = null;
  if (isAiConfigured()) {
    try {
      ai = await aiExtract(data.rawText, roster);
      if (!ai) aiError = "AI didn't return usable results — showing rule-based items only.";
    } catch (e: any) {
      aiError = "AI extraction failed — showing rule-based items only.";
      console.error("[import] ai step failed:", e);
    }
  }

  const ruleKeys = new Set(ruleItems.map((r) => r.text));
  const found = mergeExtractions(ruleItems, ai, roster, (t) => extractDueDate(t));

  const imp = await prisma.meetingImport.create({
    data: {
      title: data.title?.trim() || "Meeting notes",
      rawText: data.rawText,
      projectId: data.projectId || null,
      meetingId: data.meetingId || null,
      source: data.source === "TRANSCRIPT" ? "TRANSCRIPT" : "PASTE",
      importedById: me.id,
      aiSummary: ai?.summary ?? null,
      aiDecisions: ai?.decisions.length ? ai.decisions.join("\n") : null,
      aiUsed: !!ai,
      aiError,
      items: {
        create: found.map((f, order) => ({
          text: f.text,
          suggestedAssigneeIds: namesToIds(f.matchedNames, roster).join(",") || null,
          suggestedDueDate: f.dueDate,
          matchedNames: f.matchedNames.join(", ") || null,
          reason: f.reason,
          confidence: f.confidence,
          sourceLine: f.sourceLine,
          origin: ruleKeys.has(f.text) ? "rules" : "ai",
          order,
          // Low-confidence items start unticked so nothing questionable gets
          // created by someone clicking straight through.
          accepted: f.confidence !== "low",
        })),
      },
    },
    include: { items: true },
  });

  revalidatePath("/meetings");
  return { ok: true, id: imp.id, found: found.length };
}

export async function updateImportItem(
  itemId: string,
  data: { text?: string; assigneeIds?: string[]; dueDate?: string | null; accepted?: boolean }
) {
  await requireAuth();
  await prisma.meetingImportItem.update({
    where: { id: itemId },
    data: {
      ...(data.text !== undefined ? { text: data.text.trim() } : {}),
      ...(data.assigneeIds !== undefined
        ? { suggestedAssigneeIds: data.assigneeIds.filter(Boolean).join(",") || null }
        : {}),
      ...(data.dueDate !== undefined
        ? { suggestedDueDate: data.dueDate ? new Date(data.dueDate) : null }
        : {}),
      ...(data.accepted !== undefined ? { accepted: data.accepted } : {}),
    },
  });
  revalidatePath("/meetings");
  return { ok: true };
}

/** Turn the accepted suggestions into real tasks. This is the only step that writes tasks. */
export async function applyMeetingImport(importId: string, projectId: string) {
  const me = await requireAuth();
  const perms = await getProjectPermissions(me, projectId);
  if (!perms.canEditTodos) throw new Error("You can't create tasks on that project.");

  const imp = await prisma.meetingImport.findUnique({
    where: { id: importId },
    include: { items: { orderBy: { order: "asc" } } },
  });
  if (!imp) throw new Error("Import not found.");
  if (imp.status === "APPLIED") throw new Error("These notes have already been turned into tasks.");

  const accepted = imp.items.filter((i) => i.accepted && i.text.trim());
  if (!accepted.length) throw new Error("Nothing is ticked to create.");

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { title: true } });
  const maxOrder = await prisma.todo.aggregate({ where: { projectId }, _max: { order: true } });
  let order = (maxOrder._max.order ?? -1) + 1;
  const created: { id: string; text: string; assignees: string[] }[] = [];

  for (const item of accepted) {
    const assigneeIds = (item.suggestedAssigneeIds ?? "").split(",").filter(Boolean);
    const todo = await prisma.todo.create({
      data: {
        projectId,
        text: item.text.trim(),
        dueDate: item.suggestedDueDate,
        createdById: me.id,
        order: order++,
        // Meeting-derived tasks need the lead to confirm completion — that's
        // the whole point of tracking them out of a meeting.
        requiresConfirmation: true,
        sourceMeetingId: imp.meetingId,
        meetingImportItemId: item.id,
        assignees: { create: assigneeIds.map((memberId) => ({ memberId })) },
      },
    });
    await prisma.meetingImportItem.update({ where: { id: item.id }, data: { createdTodoId: todo.id } });
    created.push({ id: todo.id, text: todo.text, assignees: assigneeIds });

    await prisma.todoComment.create({
      data: {
        todoId: todo.id,
        authorId: me.id,
        authorName: me.name,
        kind: "COMMENT",
        body: `Created from "${imp.title}".`,
      },
    });

    if (assigneeIds.length) {
      await prisma.notification.createMany({
        data: assigneeIds
          .filter((id) => id !== me.id)
          .map((recipientId) => ({
            recipientId,
            type: "TASK_ASSIGNED",
            title: `From ${imp.title}`,
            body: `${todo.text} — ${project?.title ?? ""}`,
            link: "/tasks",
          })),
      });
      const { notifyBySms } = await import("./sms/send");
      for (const id of assigneeIds) {
        if (id === me.id) continue;
        void notifyBySms(
          id,
          `New task from ${imp.title}: ${todo.text}${todo.dueDate ? ` (due ${todo.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : ""}`,
          projectId
        );
      }
    }
  }

  await prisma.meetingImport.update({
    where: { id: importId },
    data: { status: "APPLIED", appliedAt: new Date(), projectId },
  });

  await logActivity({
    projectId,
    actor: me,
    action: "task.created",
    summary: `Created ${created.length} task(s) from "${imp.title}"`,
    meta: { importId },
  });

  revalidatePath("/meetings");
  revalidatePath("/tasks");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, created: created.length };
}

export async function deleteMeetingImport(id: string) {
  const me = await requireAuth();
  const imp = await prisma.meetingImport.findUnique({ where: { id } });
  if (!imp) throw new Error("Import not found.");
  if (imp.importedById !== me.id && me.role !== "ADMIN") {
    throw new Error("Only the person who imported these notes, or an admin, can remove them.");
  }
  await prisma.meetingImport.delete({ where: { id } });
  revalidatePath("/meetings");
  return { ok: true };
}

// ---------- Task threads & completion confirmation ----------

export async function addTodoComment(todoId: string, body: string) {
  const me = await requireAuth();
  if (!body?.trim()) throw new Error("Write something first.");

  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    include: { project: { select: { id: true, title: true, leadId: true } }, assignees: true },
  });
  if (!todo) throw new Error("Task not found.");

  const perms = await getProjectPermissions(me, todo.projectId);
  const isAssignee = todo.assignees.some((a) => a.memberId === me.id);
  if (!perms.canView && !isAssignee) throw new Error("You don't have access to this task.");

  await prisma.todoComment.create({
    data: { todoId, authorId: me.id, authorName: me.name, body: body.trim(), kind: "COMMENT" },
  });

  // Notify everyone already in the conversation — assignees, the project lead,
  // and anyone who has commented — except whoever just wrote it.
  const priorAuthors = await prisma.todoComment.findMany({
    where: { todoId, authorId: { not: null } },
    select: { authorId: true },
    distinct: ["authorId"],
  });
  const audience = new Set<string>([
    ...todo.assignees.map((a) => a.memberId),
    ...(todo.project.leadId ? [todo.project.leadId] : []),
    ...priorAuthors.map((p) => p.authorId!).filter(Boolean),
  ]);
  audience.delete(me.id);

  if (audience.size) {
    await prisma.notification.createMany({
      data: Array.from(audience).map((recipientId) => ({
        recipientId,
        type: "GENERAL",
        title: `${me.name} commented on a task`,
        body: `${todo.text.slice(0, 60)} — ${body.trim().slice(0, 80)}`,
        link: "/tasks",
      })),
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/projects/${todo.projectId}`);
  return { ok: true };
}

/** Assignee marks it done. If confirmation is required, the lead is notified. */
export async function markTodoDone(todoId: string, note?: string) {
  const me = await requireAuth();
  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    include: { project: { select: { id: true, title: true, leadId: true, ownerId: true } }, assignees: true },
  });
  if (!todo) throw new Error("Task not found.");

  const perms = await getProjectPermissions(me, todo.projectId);
  const isAssignee = todo.assignees.some((a) => a.memberId === me.id);
  if (!isAssignee && !perms.canEditTodos) throw new Error("Only an assignee can mark this done.");

  await prisma.todo.update({
    where: { id: todoId },
    data: { done: true, completedById: me.id, completedAt: new Date(), reopenedAt: null },
  });

  await prisma.todoComment.create({
    data: {
      todoId,
      authorId: me.id,
      authorName: me.name,
      kind: "COMPLETED",
      body: note?.trim() || "Marked as done.",
    },
  });

  const lead = todo.project.leadId ?? todo.project.ownerId;
  if (todo.requiresConfirmation && lead && lead !== me.id) {
    await prisma.notification.create({
      data: {
        recipientId: lead,
        type: "GENERAL",
        title: `${me.name} completed a task — needs your confirmation`,
        body: `${todo.text} — ${todo.project.title}`,
        link: "/tasks",
      },
    });
    const { notifyBySms } = await import("./sms/send");
    void notifyBySms(lead, `${me.name} marked done: ${todo.text} (${todo.project.title}). Confirm in the app.`, todo.projectId);
  }

  revalidatePath("/tasks");
  revalidatePath(`/projects/${todo.projectId}`);
  return { ok: true };
}

/** Project lead confirms — or rejects and reopens with a reason. */
export async function confirmTodo(todoId: string, approve: boolean, note?: string) {
  const me = await requireAuth();
  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    include: { project: { select: { id: true, title: true, leadId: true, ownerId: true } }, assignees: true },
  });
  if (!todo) throw new Error("Task not found.");

  const isLead = todo.project.leadId === me.id || todo.project.ownerId === me.id;
  const perms = await getProjectPermissions(me, todo.projectId);
  if (!isLead && me.role !== "ADMIN" && !perms.canEditTodos) {
    throw new Error("Only the project lead or an admin can confirm this.");
  }
  if (todo.completedById === me.id && me.role !== "ADMIN") {
    throw new Error("Someone else needs to confirm work you completed yourself.");
  }

  if (approve) {
    await prisma.todo.update({
      where: { id: todoId },
      data: { confirmedById: me.id, confirmedAt: new Date() },
    });
    await prisma.todoComment.create({
      data: { todoId, authorId: me.id, authorName: me.name, kind: "CONFIRMED", body: note?.trim() || "Confirmed complete." },
    });
  } else {
    await prisma.todo.update({
      where: { id: todoId },
      data: { done: false, confirmedById: null, confirmedAt: null, reopenedAt: new Date() },
    });
    await prisma.todoComment.create({
      data: { todoId, authorId: me.id, authorName: me.name, kind: "REOPENED", body: note?.trim() || "Reopened — not complete yet." },
    });
  }

  const targets = new Set(todo.assignees.map((a) => a.memberId));
  if (todo.completedById) targets.add(todo.completedById);
  targets.delete(me.id);
  if (targets.size) {
    await prisma.notification.createMany({
      data: Array.from(targets).map((recipientId) => ({
        recipientId,
        type: "GENERAL",
        title: approve ? `${me.name} confirmed your work` : `${me.name} reopened a task`,
        body: `${todo.text} — ${todo.project.title}`,
        link: "/tasks",
      })),
    });
  }

  revalidatePath("/tasks");
  revalidatePath(`/projects/${todo.projectId}`);
  return { ok: true };
}

/**
 * Build an import straight from a meeting that already has notes, instead of
 * re-pasting them. Pulls the notes, description and agenda together so a
 * commitment captured in the agenda isn't missed.
 */
export async function importFromExistingMeeting(meetingId: string, projectId?: string | null) {
  const me = await requireAuth();

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { agendaItems: { orderBy: { order: "asc" } }, project: { select: { id: true } } },
  });
  if (!meeting) throw new Error("Meeting not found.");

  const target = projectId || meeting.projectId || null;
  if (target) {
    const perms = await getProjectPermissions(me, target);
    if (!perms.canEditTodos) throw new Error("You can't create tasks on that project.");
  }

  // Combine everything written about this meeting. Agenda items often contain
  // the actual commitments ("Ryan - order HVAC"), so skipping them would miss
  // real action items.
  const parts: string[] = [];
  if (meeting.description?.trim()) parts.push(meeting.description.trim());
  if (meeting.agendaItems.length) {
    parts.push(meeting.agendaItems.map((a) => `- ${a.text}`).join("\n"));
  }
  if (meeting.notes?.trim()) parts.push(meeting.notes.trim());

  const rawText = parts.join("\n\n");
  if (!rawText.trim()) {
    throw new Error("This meeting has no notes, description or agenda to pull from yet.");
  }

  const existing = await prisma.meetingImport.findFirst({
    where: { meetingId, status: "DRAFT" },
  });
  if (existing) {
    throw new Error("There's already a draft import for this meeting — review that one first.");
  }

  return createMeetingImport({
    title: meeting.title,
    rawText,
    projectId: target,
    meetingId,
    source: "PASTE",
  });
}

// ---------- Purchase requests ----------

async function purchaseCaps(me: { id: string; role: string }) {
  const { getGlobalCapabilities } = await import("./permissions");
  const caps = await getGlobalCapabilities(me as any);
  const isAdmin = me.role === "ADMIN";
  return {
    isAdmin,
    canRequest: isAdmin || caps.canRequestPurchases,
    canApprove: isAdmin || caps.canApprovePurchases,
    canViewAll: isAdmin || caps.canViewAllPurchases,
    canRecordPayments: isAdmin || caps.canRecordPayments,
  };
}

export type PurchaseInput = {
  title: string;
  description?: string;
  category: string;
  projectId?: string | null;
  tradeShowId?: string | null;
  vendor?: string;
  vendorContact?: string;
  quantity: number;
  unitCost: number;
  neededBy?: string | null;
  urgency?: string;
};

export async function savePurchase(id: string | null, data: PurchaseInput) {
  const me = await requireAuth();
  const caps = await purchaseCaps(me);
  if (!caps.canRequest) throw new Error("You don't have permission to raise purchase requests.");
  if (!data.title?.trim()) throw new Error("Give the request a title.");

  const { PROJECT_REQUIRED } = await import("./purchases");
  if (PROJECT_REQUIRED.includes(data.category) && !data.projectId) {
    throw new Error("Material and subcontractor spend has to be attributed to a project.");
  }
  if (data.projectId) {
    const perms = await getProjectPermissions(me, data.projectId);
    if (!perms.canView) throw new Error("You don't have access to that project.");
  }

  const qty = Number(data.quantity) || 1;
  const unit = Number(data.unitCost) || 0;
  if (unit < 0 || qty <= 0) throw new Error("Quantity and unit cost have to be positive.");

  const payload = {
    title: data.title.trim(),
    description: data.description?.trim() || null,
    category: data.category,
    projectId: data.projectId || null,
    tradeShowId: data.tradeShowId || null,
    vendor: data.vendor?.trim() || null,
    vendorContact: data.vendorContact?.trim() || null,
    quantity: qty,
    unitCost: unit,
    amount: Math.round(qty * unit * 100) / 100,
    neededBy: data.neededBy ? new Date(data.neededBy) : null,
    urgency: data.urgency === "Urgent" ? "Urgent" : "Normal",
  };

  if (id) {
    const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
    if (!existing) throw new Error("Request not found.");
    // Once money is committed the record is an audit artefact, not a draft.
    if (!["DRAFT", "SUBMITTED", "REJECTED"].includes(existing.status)) {
      throw new Error(`This request is ${existing.status.toLowerCase()} and can no longer be edited.`);
    }
    if (existing.requestedById !== me.id && !caps.isAdmin) {
      throw new Error("Only the person who raised this, or an admin, can edit it.");
    }
    await prisma.purchaseRequest.update({ where: { id }, data: payload });
    revalidatePath("/purchases");
    return { ok: true, id };
  }

  // Sequential reference number. Computed here rather than by the database so
  // it behaves identically on every provider.
  const last = await prisma.purchaseRequest.aggregate({ _max: { number: true } });
  const created = await prisma.purchaseRequest.create({
    data: { ...payload, number: (last._max.number ?? 0) + 1, requestedById: me.id, status: "DRAFT" },
  });
  revalidatePath("/purchases");
  return { ok: true, id: created.id };
}

export async function submitPurchase(id: string) {
  const me = await requireAuth();
  const pr = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!pr) throw new Error("Request not found.");
  if (pr.requestedById !== me.id && me.role !== "ADMIN") {
    throw new Error("Only the person who raised this can submit it.");
  }
  if (pr.status !== "DRAFT" && pr.status !== "REJECTED") {
    throw new Error("This request has already been submitted.");
  }
  if (pr.amount <= 0) throw new Error("Add a cost before submitting.");

  await prisma.purchaseRequest.update({
    where: { id },
    data: { status: "SUBMITTED", submittedAt: new Date(), rejectedAt: null },
  });
  await prisma.purchaseComment.create({
    data: { purchaseId: id, authorId: me.id, authorName: me.name, kind: "SUBMITTED", body: "Submitted for approval." },
  });

  // Log against the project so a pending request is visible there, not only
  // once it's approved — waiting spend is exactly what a lead needs to see.
  if (pr.projectId) {
    await logActivity({
      projectId: pr.projectId,
      actor: me,
      action: "financials.updated",
      summary: `Requested ${pr.title} — $${pr.amount.toLocaleString("en-US")} (PR-${String(pr.number).padStart(4, "0")}), awaiting approval`,
      meta: { purchaseId: id },
    });
  }

  // Tell everyone who could actually approve it, rather than everyone.
  const approvers = await prisma.teamMember.findMany({
    where: { OR: [{ role: "ADMIN" }, { customRole: { canApprovePurchases: true } }] },
    select: { id: true },
  });
  const targets = approvers.map((a) => a.id).filter((x) => x !== me.id);
  if (targets.length) {
    await prisma.notification.createMany({
      data: targets.map((recipientId) => ({
        recipientId,
        type: "GENERAL",
        title: `Purchase needs approval — $${pr.amount.toLocaleString("en-US")}`,
        body: `${pr.title} · raised by ${me.name}`,
        link: "/purchases",
      })),
    });
  }

  revalidatePath("/purchases");
  return { ok: true };
}

/**
 * Approve. On final approval this writes a committed line item into the
 * project ledger, which is what keeps budgets honest — spend can no longer
 * happen without the project knowing about it.
 */
export async function approvePurchase(id: string, note?: string) {
  const me = await requireAuth();
  const { canApprovePurchase, budgetImpact } = await import("./purchases");

  const check = await canApprovePurchase(me, id);
  if (!check.canApprove) throw new Error(check.reason || "You can't approve this request.");

  const pr = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: { project: { select: { id: true, title: true, estBudget: true, committed: true } } },
  });
  if (!pr) throw new Error("Request not found.");

  const impact = await budgetImpact(id);
  const isSecondSignature = pr.status === "APPROVED";

  if (isSecondSignature) {
    await prisma.purchaseRequest.update({
      where: { id },
      data: { secondApprovedById: me.id, secondApprovedAt: new Date() },
    });
  } else {
    await prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: me.id,
        approvedAt: new Date(),
        rejectedAt: null,
        budgetAtApproval: impact?.budget ?? null,
        committedAtApproval: impact?.committed ?? null,
      },
    });
  }

  await prisma.purchaseComment.create({
    data: {
      purchaseId: id,
      authorId: me.id,
      authorName: me.name,
      kind: "APPROVED",
      body: note?.trim() || (isSecondSignature ? "Second approval given." : "Approved."),
    },
  });

  // Post to the ledger only once fully approved, and only once ever.
  const fullyApproved = !check.needsSecondSignoff || isSecondSignature;
  if (fullyApproved && pr.projectId && !pr.lineItemId) {
    const maxOrder = await prisma.financialLineItem.aggregate({
      where: { projectId: pr.projectId },
      _max: { order: true },
    });
    const line = await prisma.financialLineItem.create({
      data: {
        projectId: pr.projectId,
        category: pr.category === "MATERIAL" ? "Material" : pr.category === "SUBCONTRACTOR" ? "Subcontractor" : "Other",
        description: `${pr.title}${pr.vendor ? ` — ${pr.vendor}` : ""} (PR-${String(pr.number).padStart(4, "0")})`,
        vendor: pr.vendor,
        qty: pr.quantity,
        unitCost: pr.unitCost,
        budgetAmount: pr.amount,
        actualAmount: 0,
        status: "Committed",
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
    await prisma.purchaseRequest.update({ where: { id }, data: { lineItemId: line.id } });

    // Roll the project's committed total forward so the dashboard reflects it.
    await prisma.project.update({
      where: { id: pr.projectId },
      data: { committed: { increment: pr.amount } },
    });
  }

  if (pr.requestedById && pr.requestedById !== me.id) {
    await prisma.notification.create({
      data: {
        recipientId: pr.requestedById,
        type: "GENERAL",
        title: fullyApproved ? "Purchase approved" : "First approval given",
        body: `${pr.title} — $${pr.amount.toLocaleString("en-US")}`,
        link: "/purchases",
      },
    });
    const { notifyBySms } = await import("./sms/send");
    if (fullyApproved) {
      void notifyBySms(pr.requestedById, `Approved: ${pr.title} ($${pr.amount.toLocaleString("en-US")})`, pr.projectId);
    }
  }

  await logActivity({
    projectId: pr.projectId ?? undefined,
    actor: me,
    action: "financials.updated",
    summary: `Approved PR-${String(pr.number).padStart(4, "0")} "${pr.title}" — $${pr.amount.toLocaleString("en-US")}`,
    meta: { purchaseId: id },
  });

  revalidatePath("/purchases");
  if (pr.projectId) revalidatePath(`/projects/${pr.projectId}`);
  return { ok: true };
}

export async function rejectPurchase(id: string, note: string) {
  const me = await requireAuth();
  const { canApprovePurchase } = await import("./purchases");
  const check = await canApprovePurchase(me, id);
  if (!check.canApprove) throw new Error(check.reason || "You can't act on this request.");
  if (!note?.trim()) throw new Error("Give a reason so the requester knows what to change.");

  const pr = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!pr) throw new Error("Request not found.");

  await prisma.purchaseRequest.update({
    where: { id },
    data: { status: "REJECTED", rejectedAt: new Date(), approvedById: null, approvedAt: null },
  });
  await prisma.purchaseComment.create({
    data: { purchaseId: id, authorId: me.id, authorName: me.name, kind: "REJECTED", body: note.trim() },
  });

  if (pr.projectId) {
    await logActivity({
      projectId: pr.projectId,
      actor: me,
      action: "financials.updated",
      summary: `Returned PR-${String(pr.number).padStart(4, "0")} "${pr.title}" — ${note.trim().slice(0, 60)}`,
      meta: { purchaseId: id },
    });
  }

  if (pr.requestedById && pr.requestedById !== me.id) {
    await prisma.notification.create({
      data: {
        recipientId: pr.requestedById,
        type: "GENERAL",
        title: "Purchase request returned",
        body: `${pr.title} — ${note.trim().slice(0, 80)}`,
        link: "/purchases",
      },
    });
  }

  revalidatePath("/purchases");
  return { ok: true };
}

/** Move through ordered -> received -> invoiced -> paid. */
export async function advancePurchase(
  id: string,
  to: string,
  extra?: { poNumber?: string; invoiceRef?: string; actualAmount?: number }
) {
  const me = await requireAuth();
  const caps = await purchaseCaps(me);
  const pr = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!pr) throw new Error("Request not found.");

  const ORDER = ["APPROVED", "ORDERED", "RECEIVED", "INVOICED", "PAID"];
  if (!ORDER.includes(to)) throw new Error("Invalid status.");
  if (!ORDER.includes(pr.status)) throw new Error("This request hasn't been approved yet.");
  if (ORDER.indexOf(to) <= ORDER.indexOf(pr.status)) {
    throw new Error("A purchase can only move forward.");
  }
  if (to === "PAID" && !caps.canRecordPayments) {
    throw new Error("You don't have permission to record payments.");
  }
  if (!caps.canApprove && !caps.canRecordPayments && pr.requestedById !== me.id) {
    throw new Error("You can't update this request.");
  }

  const stamp: any = { status: to };
  if (to === "ORDERED") stamp.orderedAt = new Date();
  if (to === "RECEIVED") stamp.receivedAt = new Date();
  if (to === "INVOICED") stamp.invoicedAt = new Date();
  if (to === "PAID") stamp.paidAt = new Date();
  if (extra?.poNumber) stamp.poNumber = extra.poNumber.trim();
  if (extra?.invoiceRef) stamp.invoiceRef = extra.invoiceRef.trim();

  await prisma.purchaseRequest.update({ where: { id }, data: stamp });
  await prisma.purchaseComment.create({
    data: { purchaseId: id, authorId: me.id, authorName: me.name, kind: to, body: `Marked ${to.toLowerCase()}.` },
  });

  if (pr.projectId) {
    await logActivity({
      projectId: pr.projectId,
      actor: me,
      action: "financials.updated",
      summary: `PR-${String(pr.number).padStart(4, "0")} "${pr.title}" marked ${to.toLowerCase()}`,
      meta: { purchaseId: id },
    });
  }

  // Once invoiced, the committed figure becomes real spend.
  if (to === "INVOICED" && pr.lineItemId) {
    const actual = extra?.actualAmount ?? pr.amount;
    await prisma.financialLineItem.update({
      where: { id: pr.lineItemId },
      data: { actualAmount: actual, status: "Invoiced", invoiceRef: extra?.invoiceRef ?? null },
    });
    if (pr.projectId) {
      await prisma.project.update({
        where: { id: pr.projectId },
        data: { actualSpend: { increment: actual } },
      });
    }
  }
  if (to === "PAID" && pr.lineItemId) {
    await prisma.financialLineItem.update({
      where: { id: pr.lineItemId },
      data: { status: "Paid", paidDate: new Date() },
    });
  }

  revalidatePath("/purchases");
  if (pr.projectId) revalidatePath(`/projects/${pr.projectId}`);
  return { ok: true };
}

export async function cancelPurchase(id: string, note?: string) {
  const me = await requireAuth();
  const caps = await purchaseCaps(me);
  const pr = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!pr) throw new Error("Request not found.");
  if (pr.requestedById !== me.id && !caps.isAdmin && !caps.canApprove) {
    throw new Error("You can't cancel this request.");
  }
  if (["PAID"].includes(pr.status)) throw new Error("A paid purchase can't be cancelled.");

  // Release the committed money back to the project.
  if (pr.lineItemId && pr.projectId) {
    await prisma.financialLineItem.delete({ where: { id: pr.lineItemId } }).catch(() => {});
    await prisma.project.update({
      where: { id: pr.projectId },
      data: { committed: { decrement: pr.amount } },
    });
  }

  await prisma.purchaseRequest.update({
    where: { id },
    data: { status: "CANCELLED", lineItemId: null },
  });
  await prisma.purchaseComment.create({
    data: { purchaseId: id, authorId: me.id, authorName: me.name, kind: "CANCELLED", body: note?.trim() || "Cancelled." },
  });

  revalidatePath("/purchases");
  return { ok: true };
}

export async function addPurchaseComment(purchaseId: string, body: string) {
  const me = await requireAuth();
  if (!body?.trim()) throw new Error("Write something first.");
  const pr = await prisma.purchaseRequest.findUnique({ where: { id: purchaseId } });
  if (!pr) throw new Error("Request not found.");

  await prisma.purchaseComment.create({
    data: { purchaseId, authorId: me.id, authorName: me.name, body: body.trim(), kind: "COMMENT" },
  });

  const audience = new Set<string>();
  if (pr.requestedById) audience.add(pr.requestedById);
  if (pr.approvedById) audience.add(pr.approvedById);
  audience.delete(me.id);
  if (audience.size) {
    await prisma.notification.createMany({
      data: Array.from(audience).map((recipientId) => ({
        recipientId,
        type: "GENERAL",
        title: `${me.name} commented on a purchase`,
        body: `${pr.title} — ${body.trim().slice(0, 70)}`,
        link: "/purchases",
      })),
    });
  }

  revalidatePath("/purchases");
  return { ok: true };
}

// ---------- Audit, reconciliation, restore ----------

async function requireAuditViewer() {
  const me = await requireAuth();
  if (me.role === "ADMIN") return me;
  const { getGlobalCapabilities } = await import("./permissions");
  const caps = await getGlobalCapabilities(me);
  if (!caps.canViewAuditLog) throw new Error("You don't have permission to view the audit log.");
  return me;
}

/** Run a reconciliation check. Read-only unless repair is explicitly requested. */
export async function runReconciliation(repair: boolean) {
  const me = await requireAuth();
  const { getGlobalCapabilities } = await import("./permissions");
  const caps = await getGlobalCapabilities(me);
  if (me.role !== "ADMIN" && !caps.canViewAllFinancials) {
    throw new Error("You don't have permission to reconcile financials.");
  }
  // Repairing rewrites financial figures, so it's admin-only even if someone
  // can view them.
  if (repair && me.role !== "ADMIN") {
    throw new Error("Only an administrator can apply financial corrections.");
  }

  const { reconcile } = await import("./reconcile");
  const result = await reconcile({
    actor: { id: me.id, name: me.name, email: me.email },
    repair,
  });

  revalidatePath("/settings/audit");
  revalidatePath("/dashboard");
  return {
    ok: true,
    checked: result.checked,
    driftCount: result.drift.length,
    repaired: result.repaired,
    drift: result.drift,
  };
}

/** Inspect a backup file. Changes nothing — this is the mandatory first step. */
export async function previewRestore(json: string) {
  const me = await requireAuth();
  const { getGlobalCapabilities } = await import("./permissions");
  const caps = await getGlobalCapabilities(me);
  if (me.role !== "ADMIN" && !caps.canRestoreBackup) {
    throw new Error("You don't have permission to restore backups.");
  }
  if (!json?.trim()) throw new Error("Choose a backup file first.");

  const { planRestore } = await import("./restore");
  return planRestore(json);
}

/**
 * Apply a restore. Requires typing the exact confirmation phrase — a restore
 * is not something anyone should be able to trigger with a stray click.
 */
export async function confirmRestore(json: string, confirmation: string) {
  const me = await requireAuth();
  const { getGlobalCapabilities } = await import("./permissions");
  const caps = await getGlobalCapabilities(me);
  if (me.role !== "ADMIN" && !caps.canRestoreBackup) {
    throw new Error("You don't have permission to restore backups.");
  }
  if (confirmation.trim().toUpperCase() !== "RESTORE") {
    throw new Error('Type RESTORE to confirm.');
  }

  const { planRestore, applyRestore } = await import("./restore");
  const plan = await planRestore(json);
  if (!plan.valid) throw new Error(plan.error || "That backup file can't be read.");

  const result = await applyRestore(json);

  const { recordAudit } = await import("./audit");
  await recordAudit({
    entityType: "Settings",
    entityId: "restore",
    entityLabel: "Backup restore",
    action: "RESTORE",
    actor: { id: me.id, name: me.name, email: me.email },
    summary: `Restored ${result.totalCreated} record(s) from backup${plan.backupDate ? ` dated ${new Date(plan.backupDate).toLocaleDateString("en-US")}` : ""}; ${result.skipped} already present`,
  });

  revalidatePath("/settings/audit");
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  return { ok: true, ...result };
}

// ---------- Assistant ----------

export async function askAssistantAction(threadId: string | null, question: string) {
  const me = await requireAuth();
  if (!question?.trim()) throw new Error("Ask a question first.");

  let thread = threadId
    ? await prisma.chatThread.findFirst({
        where: { id: threadId, memberId: me.id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
    : null;

  if (!thread) {
    thread = await prisma.chatThread.create({
      data: {
        memberId: me.id,
        // First question makes a serviceable title without another API call.
        title: question.trim().slice(0, 60),
      },
      include: { messages: true },
    });
  }

  await prisma.chatMessage.create({
    data: { threadId: thread.id, role: "user", content: question.trim() },
  });

  const { askAssistant } = await import("./ai/assistant");
  const history = (thread.messages ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const result = await askAssistant(me, history, question.trim());

  if (!result.ok) {
    // Keep the question in the thread so it isn't lost, but surface the error.
    throw new Error(result.error || "The assistant couldn't answer.");
  }

  await prisma.chatMessage.create({
    data: { threadId: thread.id, role: "assistant", content: result.answer! },
  });
  await prisma.chatThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });

  revalidatePath("/assistant");
  return { ok: true, threadId: thread.id, answer: result.answer };
}

export async function deleteChatThread(id: string) {
  const me = await requireAuth();
  const t = await prisma.chatThread.findFirst({ where: { id, memberId: me.id } });
  if (!t) throw new Error("Conversation not found.");
  await prisma.chatThread.delete({ where: { id } });
  revalidatePath("/assistant");
  return { ok: true };
}

// ---------- Archive instead of delete ----------

/**
 * Archives a project rather than destroying it. The schema has always had an
 * `archived` flag that delete never used — a wrong click was permanently
 * removing tasks, files, financials, purchases and history with no way back.
 */
export async function archiveProject(id: string, archived: boolean) {
  const me = await requireAuth();
  const { getGlobalCapabilities } = await import("./permissions");
  const [proj, caps] = await Promise.all([
    prisma.project.findUnique({ where: { id }, select: { ownerId: true, title: true, archived: true } }),
    getGlobalCapabilities(me),
  ]);
  if (!proj) throw new Error("Project not found.");

  const allowed = me.role === "ADMIN" || caps.canDeleteAnyProject || proj.ownerId === me.id;
  if (!allowed) throw new Error("You can only archive projects you own.");

  await prisma.project.update({ where: { id }, data: { archived } });

  const { recordAudit } = await import("./audit");
  await recordAudit({
    entityType: "Project",
    entityId: id,
    entityLabel: proj.title,
    action: archived ? "ARCHIVE" : "RESTORE",
    actor: { id: me.id, name: me.name, email: me.email },
    summary: archived
      ? "Archived — hidden from dashboards but fully recoverable"
      : "Restored from archive",
  });

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { ok: true };
}
