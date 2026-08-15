import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import ExhibitorImportWizard from "@/components/ExhibitorImportWizard";
import { getExhibitorAccess } from "@/lib/exhibitors/access";
import { PAGE_CONTAINER } from "@/lib/layout";

export const dynamic = "force-dynamic";

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requirePageAuth();

  const show = await prisma.tradeShow.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!show) notFound();

  const access = await getExhibitorAccess(me, id);
  if (!access.canManage) notFound();

  return (
    <AppShell active="/trade-shows">
      <main className={PAGE_CONTAINER}>
        <ExhibitorImportWizard showId={show.id} showName={show.name} />
      </main>
    </AppShell>
  );
}
