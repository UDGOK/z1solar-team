import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import ProjectForm from "@/components/ProjectForm";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({ params }: { params: { id: string } }) {
  const session = await requirePageAuth();
  const [project, teamMembers] = await Promise.all([
    prisma.project.findUnique({
      where: { id: params.id },
      include: {
        members: true,
        talkingPoints: { orderBy: { order: "asc" } },
        keyDates: { orderBy: { order: "asc" } },
        todos: { orderBy: { order: "asc" } },
        questions: { orderBy: { order: "asc" } },
      },
    }),
    prisma.teamMember.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  if (!project) notFound();

  return (
    <div className="min-h-screen bg-brand-greenTint">
      <Navbar active="/projects" />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <p className="kicker mb-1">[ Z1POWER ]</p>
        <h1 className="font-heading text-3xl font-extrabold text-brand-ink mb-6">Edit — {project.title}</h1>
        <ProjectForm teamMembers={teamMembers} initial={project} isAdmin={session.role === "ADMIN"} />
      </main>
    </div>
  );
}
