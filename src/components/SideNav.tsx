"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut } from "next-auth/react";

export type NavCategory = { name: string; count: number; color: string };

const MAIN = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/tasks", label: "Tasks", icon: "check" },
  { href: "/messages", label: "Messages", icon: "chat" },
  { href: "/meetings", label: "Meetings", icon: "calendar" },
  { href: "/sms", label: "Texts", icon: "chat" },
  { href: "/purchases", label: "Purchases", icon: "cart" },
];

const WORKSPACE = [
  { href: "/resources", label: "Resources", icon: "folder" },
  { href: "/trade-shows", label: "Trade shows", icon: "calendar" },
  { href: "/team", label: "Team", icon: "users" },
  { href: "/settings", label: "Settings", icon: "cog" },
];

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    check: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 11l3 3 5-5" /></>,
    chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.5a3.5 3.5 0 0 1 0 6.5M17.5 20a6 6 0 0 0-2-4.4" /></>,
    cog: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    cart: <><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2.5 3h2.2l2.3 12h11.4l2.1-8.5H6" /></>,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className={className} aria-hidden="true" {...common}>
      {paths[name]}
    </svg>
  );
}

export default function SideNav({
  active,
  categories,
  memberName,
  isAdmin,
  openTaskCount,
  unreadMessageCount,
}: {
  active: string;
  categories: NavCategory[];
  memberName: string;
  isAdmin: boolean;
  openTaskCount: number;
  unreadMessageCount: number;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const badges: Record<string, number> = { "/tasks": openTaskCount, "/messages": unreadMessageCount };

  const navBody = (
    <>
      <div className="px-3 pb-3 mb-3 border-b border-brand-line">
        <p className="font-heading font-extrabold text-[13px] text-brand-ink tracking-tight">Z1POWER</p>
        <p className="text-[8px] font-semibold tracking-[0.12em] text-brand-green mt-px">TEAM HUB</p>
      </div>

      <div className="px-2">
        {MAIN.map((l) => {
          const on = active === l.href;
          const n = badges[l.href] || 0;
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded mb-px transition-colors ${
                on ? "bg-brand-greenTint text-brand-ink font-medium" : "text-brand-inkSoft hover:bg-brand-greenTint/50"
              }`}
            >
              <Icon name={l.icon} className={on ? "text-brand-greenDark" : "text-brand-inkFaint"} />
              <span className="text-[12.5px] flex-1">{l.label}</span>
              {n > 0 && (
                <span className={`text-[8px] font-semibold text-white px-1.5 rounded-full ${l.href === "/tasks" ? "bg-[#C0392B]" : "bg-brand-amber"}`}>
                  {n}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {categories.length > 0 && (
        <>
          <p className="mt-4 mb-1.5 px-4 text-[8px] font-semibold tracking-[0.14em] text-brand-inkFaint">CATEGORIES</p>
          <div className="px-2">
            {categories.map((c) => (
              <Link
                key={c.name}
                href={`/projects?category=${encodeURIComponent(c.name)}`}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded text-brand-inkSoft hover:bg-brand-greenTint/50 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-[12.5px] flex-1 truncate">{c.name}</span>
                <span className="text-[9.5px] text-brand-inkFaint">{c.count}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <p className="mt-4 mb-1.5 px-4 text-[8px] font-semibold tracking-[0.14em] text-brand-inkFaint">WORKSPACE</p>
      <div className="px-2">
        {WORKSPACE.map((l) => {
          const on = active === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded mb-px transition-colors ${
                on ? "bg-brand-greenTint text-brand-ink font-medium" : "text-brand-inkSoft hover:bg-brand-greenTint/50"
              }`}
            >
              <Icon name={l.icon} className={on ? "text-brand-greenDark" : "text-brand-inkFaint"} />
              <span className="text-[12.5px]">{l.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="px-3 mt-5 pt-3 border-t border-brand-line">
        <p className="text-[11px] text-brand-inkSoft truncate">{memberName}</p>
        <p className="text-[9px] font-semibold tracking-wider text-brand-amber mb-2">{isAdmin ? "ADMIN" : "MEMBER"}</p>
        <button onClick={() => signOut({ callbackUrl: "/login" })} className="text-[11px] text-brand-inkFaint hover:text-brand-ink">
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-brand-line px-3 py-2.5 flex items-center gap-3">
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="text-brand-inkSoft">
          <Icon name="menu" />
        </button>
        <p className="font-heading font-extrabold text-[12px] text-brand-ink flex-1">Z1POWER</p>
        <Link href="/tasks" aria-label="Tasks" className="relative text-brand-inkSoft">
          <Icon name="check" />
          {openTaskCount > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#C0392B]" />}
        </Link>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <nav className="relative w-[250px] bg-white h-full overflow-y-auto py-3 shadow-xl">{navBody}</nav>
        </div>
      )}

      {/* Desktop sidebar */}
      <nav className="hidden lg:block w-[168px] shrink-0 bg-white border-r border-brand-line py-3 sticky top-0 h-screen overflow-y-auto">
        {navBody}
      </nav>

      {/* Mobile bottom tabs */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-brand-line flex py-1.5 pb-2">
        {[
          { href: "/dashboard", label: "Dashboard", icon: "grid" },
          { href: "/tasks", label: "Tasks", icon: "check", badge: openTaskCount },
          { href: "/projects", label: "Projects", icon: "folder" },
          { href: "/messages", label: "Messages", icon: "chat", badge: unreadMessageCount },
        ].map((t) => {
          const on = active === t.href;
          return (
            <Link key={t.href} href={t.href} className="flex-1 flex flex-col items-center gap-0.5 relative">
              <Icon name={t.icon} className={on ? "text-brand-green" : "text-brand-inkFaint"} />
              {!!t.badge && t.badge > 0 && (
                <span className="absolute top-0 right-[22%] bg-[#C0392B] text-white text-[7px] px-1 rounded-full">{t.badge}</span>
              )}
              <span className={`text-[8px] ${on ? "text-brand-greenDark font-medium" : "text-brand-inkFaint"}`}>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
