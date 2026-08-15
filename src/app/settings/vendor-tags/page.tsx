import { redirect } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PAGE_CONTAINER } from "@/lib/layout";
import AppShell from "@/components/AppShell";
import VendorTagManager, { type TagItem } from "@/components/VendorTagManager";

export const dynamic = "force-dynamic";

export default async function VendorTagsPage() {
  const me = await requirePageAuth();
  const record = await prisma.teamMember.findUnique({
    where: { id: me.id },
    select: { canManageTradeShows: true },
  });
  // Same gate as the rest of the module — tags belong to trade shows, not to
  // the general settings surface.
  if (me.role !== "ADMIN" && !record?.canManageTradeShows) redirect("/settings");

  const tags = await prisma.vendorTag.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { vendors: true } } },
  });

  const items: TagItem[] = tags.map((t) => ({
    id: t.id,
    name: t.name,
    // The count is what makes a delete safe to reason about — you can see
    // exactly how many companies you're about to untag before you do it.
    vendorCount: t._count.vendors,
  }));

  return (
    <AppShell active="/settings">
      <main className={PAGE_CONTAINER}>
        <VendorTagManager items={items} />
      </main>
    </AppShell>
  );
}
