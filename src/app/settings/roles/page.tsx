import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { getGlobalCapabilities } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import RoleManager, { type RoleItem } from "@/components/RoleManager";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const me = await requirePageAuth();
  const caps = await getGlobalCapabilities(me);
  if (!caps.canManageRoles) redirect("/settings");

  const [roles, members] = await Promise.all([
    prisma.role.findMany({ orderBy: { rank: "desc" }, include: { _count: { select: { members: true } } } }),
    prisma.teamMember.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, roleId: true, role: true } }),
  ]);

  const items: RoleItem[] = roles.map((r) => ({ ...r, memberCount: r._count.members }));

  return (
    <div className="min-h-screen bg-brand-greenTint">
      <Navbar active="/settings" />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        <div>
          <Link href="/settings" className="text-xs font-semibold text-brand-greenDark hover:underline">
            ← Back to Settings
          </Link>
          <p className="kicker mt-2 mb-1">[ Z1POWER ]</p>
          <h1 className="font-heading text-3xl font-extrabold text-brand-ink">Roles &amp; Permissions</h1>
        </div>
        <RoleManager
          roles={items}
          members={members.map((m) => ({
            id: m.id, name: m.name, roleId: m.roleId, isSystemAdmin: m.role === "ADMIN",
          }))}
        />
      </main>
    </div>
  );
}
