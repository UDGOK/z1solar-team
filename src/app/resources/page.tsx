import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGlobalCapabilities } from "@/lib/permissions";
import { PAGE_CONTAINER } from "@/lib/layout";
import AppShell from "@/components/AppShell";
import ResourcesHub, { type ResourceCat } from "@/components/ResourcesHub";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const me = await requirePageAuth();
  const isAdmin = me.role === "ADMIN";
  const caps = await getGlobalCapabilities(me);
  if (!isAdmin && !caps.canViewResources) notFound();

  const cats = await prisma.resourceCategory.findMany({
    orderBy: { order: "asc" },
    include: {
      items: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
    },
  });

  const categories: ResourceCat[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    color: c.color,
    items: c.items.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      kind: i.kind,
      url: i.url,
      filename: i.filename,
      size: i.size,
      tags: i.tags,
      uploadedByName: i.uploadedBy?.name ?? null,
      createdAt: i.createdAt.toISOString(),
    })),
  }));

  return (
    <AppShell active="/resources">
      <main className={PAGE_CONTAINER}>
        <div className="mb-5">
          <p className="text-[8.5px] font-semibold tracking-[0.14em] text-brand-green">[ Z1POWER ]</p>
          <h1 className="font-heading font-extrabold text-[20px] sm:text-[22px] text-brand-ink tracking-tight mt-0.5">Resources</h1>
          <p className="text-[11px] text-brand-inkSoft mt-0.5">Flyers, spec sheets, templates and the knowledge base.</p>
        </div>
        <ResourcesHub categories={categories} canManage={isAdmin || caps.canManageResources} />
      </main>
    </AppShell>
  );
}
