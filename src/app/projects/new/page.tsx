import { requirePageAuth } from "@/lib/auth";
import { getGlobalCapabilities } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import ProjectForm from "@/components/ProjectForm";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const me = await requirePageAuth();
  const caps = await getGlobalCapabilities(me);
  if (!caps.canCreateProjects) redirect("/dashboard");
  const teamMembers = await prisma.teamMember.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <AppShell active="/projects">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <p className="kicker mb-1">[ Z1POWER ]</p>
        <h1 className="font-heading text-3xl font-extrabold text-brand-ink mb-6">New Project</h1>
        <ProjectForm teamMembers={teamMembers} isAdmin />
      </main>
    </AppShell>
  );
}
