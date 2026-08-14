import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGlobalCapabilities } from "@/lib/permissions";
import { PAGE_CONTAINER } from "@/lib/layout";
import AppShell from "@/components/AppShell";
import CategoryManager, { type CatItem } from "@/components/CategoryManager";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const me = await requirePageAuth();
  const caps = await getGlobalCapabilities(me);
  if (!caps.canManageCategories) redirect("/settings");

  const [cats, projects] = await Promise.all([
    prisma.category.findMany({ orderBy: { order: "asc" } }),
    prisma.project.findMany({ where: { archived: false }, select: { category: true } }),
  ]);

  const counts = new Map<string, number>();
  for (const p of projects) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);

  const items: CatItem[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    order: c.order,
    projectCount: counts.get(c.name) ?? 0,
  }));

  return (
    <AppShell active="/settings">
      <main className={PAGE_CONTAINER}>
        <Link href="/settings" className="text-xs font-semibold text-brand-greenDark hover:underline">← Back to Settings</Link>
        <h1 className="font-heading font-extrabold text-[20px] text-brand-ink tracking-tight mt-2 mb-5">Categories</h1>
        <CategoryManager categories={items} />
      </main>
    </AppShell>
  );
}
