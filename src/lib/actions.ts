"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { createMemberSession, createAdminSession, destroySession, getSession, isAuthenticated } from "./auth";
import { verifyPassword, setPassword, setWhatsAppLink, getSettings } from "./settings";
import bcrypt from "bcryptjs";

// ---------- Auth ----------

export async function login(password: string): Promise<{ ok: boolean; error?: string }> {
  if (!password) return { ok: false, error: "Enter the team password." };
  const valid = await verifyPassword(password);
  if (!valid) return { ok: false, error: "Incorrect password." };
  await createMemberSession();
  return { ok: true };
}

export async function loginAdmin(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (!email || !password) return { ok: false, error: "Enter email and password." };
  const admin = await prisma.teamMember.findFirst({ where: { email: email.trim(), role: "ADMIN" } });
  if (!admin || !admin.passwordHash) return { ok: false, error: "Invalid admin credentials." };
  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) return { ok: false, error: "Invalid admin credentials." };
  await createAdminSession(admin.id);
  return { ok: true };
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function changeTeamPassword(currentPassword: string, newPassword: string) {
  const ok = await requireAuth();
  if (!ok) return { ok: false, error: "Not authenticated." };
  const valid = await verifyPassword(currentPassword);
  if (!valid) return { ok: false, error: "Current password is incorrect." };
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: "New password must be at least 6 characters." };
  }
  await setPassword(newPassword);
  return { ok: true };
}

async function requireAuth() {
  return isAuthenticated();
}

/** Throws if the current session isn't an admin. Use inside actions that must be admin-only. */
async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session!.role !== "ADMIN") throw new Error("Admins only.");
  return session!;
}

// ---------- Admin management (admin-only) ----------

export async function promoteToAdmin(memberId: string, email: string, password: string) {
  await requireAdmin();
  if (!email?.trim()) throw new Error("Email is required for admin login.");
  if (!password || password.length < 6) throw new Error("Password must be at least 6 characters.");
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.teamMember.update({
    where: { id: memberId },
    data: { role: "ADMIN", email: email.trim(), passwordHash },
  });
  revalidatePath("/settings");
  revalidatePath("/team");
}

export async function revokeAdmin(memberId: string) {
  const session = await requireAdmin();
  if (session.adminId === memberId) throw new Error("You can't revoke your own admin access.");
  await prisma.teamMember.update({ where: { id: memberId }, data: { role: "MEMBER", passwordHash: null } });
  revalidatePath("/settings");
  revalidatePath("/team");
}

export async function changeAdminPassword(currentPassword: string, newPassword: string) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN" || !session.adminId) return { ok: false, error: "Not signed in as admin." };
  const admin = await prisma.teamMember.findUnique({ where: { id: session.adminId } });
  if (!admin?.passwordHash) return { ok: false, error: "Admin account not found." };
  const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
  if (!valid) return { ok: false, error: "Current password is incorrect." };
  if (!newPassword || newPassword.length < 6) return { ok: false, error: "New password must be at least 6 characters." };
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.teamMember.update({ where: { id: admin.id }, data: { passwordHash } });
  return { ok: true };
}

// ---------- Team members ----------

export type TeamMemberInput = {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
};

export async function createTeamMember(data: TeamMemberInput) {
  if (!(await requireAuth())) redirect("/login");
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
  if (!(await requireAuth())) redirect("/login");
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
  if (!(await requireAuth())) redirect("/login");
  await prisma.teamMember.delete({ where: { id } });
  revalidatePath("/team");
  revalidatePath("/dashboard");
}

// ---------- Projects ----------

export type ProjectInput = {
  title: string;
  category: string;
  leadId: string | null;
  members: { memberId: string; role?: string; tasks?: string }[];
  talkingPoints: string[];
  keyDates: { milestone: string; date: string | null }[];
  todos: { text: string; done: boolean }[];
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
  await requireAdmin(); // only admins can create new projects
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
        create: data.todos.filter((t) => t.text.trim()).map((t, order) => ({ text: t.text, done: t.done, order })),
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

export async function updateProject(id: string, data: ProjectInput) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Members can edit everything except financials — even if the client somehow
  // submits financial values (e.g. a tampered request), keep the existing DB
  // values for anyone who isn't an admin. The UI hides these fields for
  // members, but this is the actual security boundary, not just the hidden form.
  let financials = {
    estBudget: data.estBudget || 0,
    committed: data.committed || 0,
    actualSpend: data.actualSpend || 0,
    q3Proj: data.q3Proj || 0,
    q4Proj: data.q4Proj || 0,
    q1Proj: data.q1Proj || 0,
    q2Proj: data.q2Proj || 0,
  };
  if (session!.role !== "ADMIN") {
    const existing = await prisma.project.findUnique({
      where: { id },
      select: { estBudget: true, committed: true, actualSpend: true, q3Proj: true, q4Proj: true, q1Proj: true, q2Proj: true },
    });
    if (existing) financials = existing;
  }

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
      title: data.title.trim(),
      category: data.category,
      leadId: data.leadId || null,
      ...financials,
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
        create: data.todos.filter((t) => t.text.trim()).map((t, order) => ({ text: t.text, done: t.done, order })),
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
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}`);
}

export async function deleteProject(id: string) {
  await requireAdmin(); // only admins can delete projects
  await prisma.project.delete({ where: { id } });
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  redirect("/projects");
}

export async function toggleTodo(todoId: string, done: boolean) {
  if (!(await requireAuth())) redirect("/login");
  const todo = await prisma.todo.update({ where: { id: todoId }, data: { done }, select: { projectId: true } });
  revalidatePath(`/projects/${todo.projectId}`);
  revalidatePath("/dashboard");
}

export async function toggleQuestion(questionId: string, resolved: boolean) {
  if (!(await requireAuth())) redirect("/login");
  const q = await prisma.openQuestion.update({
    where: { id: questionId },
    data: { resolved },
    select: { projectId: true },
  });
  revalidatePath(`/projects/${q.projectId}`);
}

// ---------- Settings ----------

export async function updateWhatsAppLink(link: string) {
  if (!(await requireAuth())) redirect("/login");
  await setWhatsAppLink(link.trim());
  revalidatePath("/team");
  revalidatePath("/dashboard");
}

export async function updateMeetingLink(link: string) {
  if (!(await requireAuth())) redirect("/login");
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
  if (!(await requireAuth())) redirect("/login");
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
  if (!(await requireAuth())) redirect("/login");
  const file = await prisma.projectFile.delete({ where: { id: fileId } });
  try {
    const { del } = await import("@vercel/blob");
    await del(file.pathname);
  } catch {
    // If the blob is already gone or the token isn't configured locally, don't
    // block the DB delete on it — the row is the source of truth for the UI.
  }
  revalidatePath(`/projects/${file.projectId}`);
}

// ---------- Shareable project summary PDF ----------

export async function generateShareableSummaryLink(projectId: string): Promise<{ url: string }> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") throw new Error("Only admins can share project summaries (they include financials).");
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
