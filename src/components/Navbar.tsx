import Link from "next/link";
import { logout } from "@/lib/actions";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/team", label: "Team" },
  { href: "/settings", label: "Settings" },
];

export default async function Navbar({ active }: { active: string }) {
  const session = await getSession();
  let badgeLabel = "TEAM";
  if (session?.role === "ADMIN" && session.adminId) {
    const admin = await prisma.teamMember.findUnique({ where: { id: session.adminId }, select: { name: true } });
    badgeLabel = admin ? `ADMIN — ${admin.name.toUpperCase()}` : "ADMIN";
  }

  return (
    <header className="border-b-2 border-brand-green bg-white sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2">
            <img src="/logo.png" alt="Z1Power" className="h-6 w-auto" />
            <span className="tag text-brand-greenDark hidden sm:inline">// TEAM HUB</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                  active === l.href
                    ? "bg-brand-green text-white"
                    : "text-brand-inkSoft hover:bg-brand-greenTint"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`hidden sm:inline-block px-2 py-1 rounded text-[10px] font-mono font-bold tracking-wider text-white ${
              session?.role === "ADMIN" ? "bg-brand-amber" : "bg-brand-inkFaint"
            }`}
          >
            {badgeLabel}
          </span>
          <form action={logout}>
            <button type="submit" className="btn-secondary !px-3 !py-1.5 text-xs">
              Sign Out
            </button>
          </form>
        </div>
      </div>
      <nav className="sm:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold whitespace-nowrap ${
              active === l.href ? "bg-brand-green text-white" : "text-brand-inkSoft hover:bg-brand-greenTint"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
