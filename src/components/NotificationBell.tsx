"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions";

type Note = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string | Date;
};

function timeAgo(d: string | Date): string {
  const then = typeof d === "string" ? new Date(d) : d;
  const mins = Math.floor((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell({ notifications }: { notifications: Note[] }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative w-8 h-8 rounded-md border border-brand-line bg-white flex items-center justify-center hover:bg-brand-greenTint"
        title="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3A3A3A" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-amber text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-auto bg-white border border-brand-line rounded-md shadow-lg z-20">
            <div className="flex items-center justify-between px-4 py-2 border-b border-brand-line sticky top-0 bg-white">
              <p className="kicker">Notifications</p>
              {unread > 0 && (
                <button
                  onClick={() => startTransition(() => markAllNotificationsRead())}
                  className="text-[11px] font-semibold text-brand-greenDark hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-sm text-brand-inkFaint text-center">Nothing new.</p>
            ) : (
              notifications.map((n) => {
                const inner = (
                  <>
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-amber shrink-0" />}
                      <div className={n.read ? "opacity-60" : ""}>
                        <p className="text-sm font-semibold text-brand-ink leading-tight">{n.title}</p>
                        {n.body && <p className="text-xs text-brand-inkSoft mt-0.5">{n.body}</p>}
                        <p className="text-[10px] text-brand-inkFaint mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                    </div>
                  </>
                );
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.read) startTransition(() => markNotificationRead(n.id));
                    }}
                    className="px-4 py-3 border-b border-brand-line last:border-0 hover:bg-brand-greenTint cursor-pointer"
                  >
                    {n.link ? (
                      <Link href={n.link} onClick={() => setOpen(false)}>
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
