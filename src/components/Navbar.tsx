import Link from "next/link";
import { logout } from "@/lib/actions";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/team", label: "Team" },
  { href: "/settings", label: "Settings" },
];

export default function Navbar({ active }: { active: string }) {
  return (
    <header className="border-b-2 border-brand-green bg-white sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="font-heading font-extrabold text-lg tracking-tight text-brand-ink">
            Z1POWER <span className="tag text-brand-greenDark">// TEAM HUB</span>
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
        <form action={logout}>
          <button type="submit" className="btn-secondary !px-3 !py-1.5 text-xs">
            Sign Out
          </button>
        </form>
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
