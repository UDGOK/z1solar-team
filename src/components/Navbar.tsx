import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";
import NotificationBell from "@/components/NotificationBell";
import AlertPopup from "@/components/AlertPopup";
import GlobalSearch from "@/components/GlobalSearch";
import { getPendingAlerts } from "@/lib/actions";
import { prisma } from "@/lib/prisma";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/tasks", label: "Tasks" },
  { href: "/messages", label: "Messages" },
  { href: "/team", label: "Team" },
  { href: "/settings", label: "Settings" },
];

export default async function Navbar({ active }: { active: string }) {
  const member = await getCurrentMember();
  const notifications = member
    ? await prisma.notification.findMany({
        where: { recipientId: member.id },
        orderBy: { createdAt: "desc" },
        take: 15,
      })
    : [];
  const pendingAlerts = member ? await getPendingAlerts() : [];
  const badgeLabel = member ? `${member.role === "ADMIN" ? "ADMIN" : "MEMBER"} — ${member.name.toUpperCase()}` : "";

  return (
    <>
    {pendingAlerts.length > 0 && <AlertPopup alerts={pendingAlerts} />}
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
          {member && <GlobalSearch />}
          {member && <NotificationBell notifications={notifications || []} />}
          {member && (
            <span
              className={`hidden sm:inline-block px-2 py-1 rounded text-[10px] font-mono font-bold tracking-wider text-white ${
                member.role === "ADMIN" ? "bg-brand-amber" : "bg-brand-inkFaint"
              }`}
            >
              {badgeLabel}
            </span>
          )}
          <SignOutButton />
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
    </>
  );
}
