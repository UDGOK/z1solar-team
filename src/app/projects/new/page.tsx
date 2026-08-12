import { requirePageAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import ProjectForm from "@/components/ProjectForm";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  await requirePageAdmin(); // only admins can create new projects
  const teamMembers = await prisma.teamMember.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <div className="min-h-screen bg-brand-greenTint">
      <Navbar active="/projects" />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <p className="kicker mb-1">[ Z1POWER ]</p>
        <h1 className="font-heading text-3xl font-extrabold text-brand-ink mb-6">New Project</h1>
        <ProjectForm teamMembers={teamMembers} isAdmin />
      </main>
    </div>
  );
}
