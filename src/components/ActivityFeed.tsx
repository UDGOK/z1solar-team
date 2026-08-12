import { prisma } from "@/lib/prisma";
import { activityIcon } from "@/lib/activity";

function when(d: Date) {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function dayLabel(d: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const that = new Date(d);
  that.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export default async function ActivityFeed({ projectId, limit = 40 }: { projectId: string; limit?: number }) {
  const items = await prisma.activity.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  if (items.length === 0) {
    return (
      <div className="p-5 border-t border-brand-line">
        <p className="kicker mb-2">Activity</p>
        <p className="text-sm text-brand-inkFaint">
          Nothing recorded yet. Changes to tasks, financials, files, and access will appear here.
        </p>
      </div>
    );
  }

  // Group by calendar day for scannability.
  const groups: { label: string; items: typeof items }[] = [];
  for (const it of items) {
    const label = dayLabel(it.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(it);
    else groups.push({ label, items: [it] });
  }

  return (
    <div className="p-5 border-t border-brand-line">
      <p className="kicker mb-3">Activity</p>
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="text-[10px] font-mono font-bold tracking-widest text-brand-inkFaint uppercase mb-2">
              {g.label}
            </p>
            <div className="space-y-0 border-l-2 border-brand-line pl-4 ml-1">
              {g.items.map((a) => (
                <div key={a.id} className="relative py-2">
                  <span className="absolute -left-[22px] top-2.5 w-3 h-3 rounded-full bg-white border-2 border-brand-green" />
                  <p className="text-sm text-brand-inkSoft leading-snug">
                    <span className="mr-1">{activityIcon(a.action)}</span>
                    <span className="font-semibold text-brand-ink">{a.actorName}</span> {a.summary}
                  </p>
                  <p className="text-[10px] text-brand-inkFaint mt-0.5">{when(a.createdAt)}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {items.length >= limit && (
        <p className="text-[11px] text-brand-inkFaint mt-3">Showing the {limit} most recent entries.</p>
      )}
    </div>
  );
}
