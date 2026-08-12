import { NextResponse } from "next/server";
import { requirePageAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Full database export as JSON. Admin-only — this contains every project,
 * financial figure, and contact detail in the system.
 *
 * This is a data backup, not a substitute for your Postgres provider's own
 * point-in-time recovery. Neon keeps automatic backups; this gives you a
 * portable copy you control, and lets you restore into a fresh database.
 */
export async function GET() {
  await requirePageAdmin();

  const [teamMembers, projects, settings] = await Promise.all([
    prisma.teamMember.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({
      orderBy: { title: "asc" },
      include: {
        members: true,
        talkingPoints: { orderBy: { order: "asc" } },
        keyDates: { orderBy: { order: "asc" } },
        todos: { orderBy: { order: "asc" } },
        questions: { orderBy: { order: "asc" } },
        files: true,
        lineItems: { orderBy: { order: "asc" } },
        rebates: { orderBy: { order: "asc" } },
        access: true,
        subscriptions: true,
      },
    }),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
  ]);

  // Strip credentials — a backup file shouldn't carry password hashes or
  // live invite tokens around.
  const safeMembers = teamMembers.map(({ passwordHash, inviteToken, inviteTokenExpires, ...rest }) => rest);

  const payload = {
    _meta: {
      exportedAt: new Date().toISOString(),
      version: 1,
      counts: {
        teamMembers: safeMembers.length,
        projects: projects.length,
        lineItems: projects.reduce((a, p) => a + p.lineItems.length, 0),
        tasks: projects.reduce((a, p) => a + p.todos.length, 0),
        files: projects.reduce((a, p) => a + p.files.length, 0),
      },
      note: "Passwords and invite tokens are intentionally excluded. Uploaded files are referenced by URL, not embedded — download them separately from Vercel Blob if you need a full archive.",
    },
    settings,
    teamMembers: safeMembers,
    projects,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="z1power-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
