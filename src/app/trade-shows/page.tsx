import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Navbar from "@/components/Navbar";
import TradeShowsHub from "@/components/TradeShowsHub";
import type { TradeShowItem } from "@/components/TradeShowCard";

export const dynamic = "force-dynamic";

export default async function TradeShowsPage() {
  const me = await requirePageAuth();
  const isAdmin = me.role === "ADMIN";

  const record = await prisma.teamMember.findUnique({
    where: { id: me.id },
    select: { canViewTradeShows: true, canManageTradeShows: true },
  });

  // No view access → behave exactly like a 404 rather than announcing that a
  // Trade Shows section exists.
  if (!isAdmin && !record?.canViewTradeShows) notFound();

  const canManage = isAdmin || !!record?.canManageTradeShows;

  const [shows, teamMembers, accessMembers] = await Promise.all([
    prisma.tradeShow.findMany({
      include: { attendees: { include: { member: { select: { id: true, name: true } } } } },
      orderBy: { startDate: "asc" },
    }),
    prisma.teamMember.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    isAdmin
      ? prisma.teamMember.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true, role: true, canViewTradeShows: true, canManageTradeShows: true },
        })
      : Promise.resolve([]),
  ]);

  const items: TradeShowItem[] = shows.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    startDate: s.startDate.toISOString(),
    endDate: s.endDate ? s.endDate.toISOString() : null,
    timeInfo: s.timeInfo,
    venue: s.venue,
    city: s.city,
    state: s.state,
    country: s.country,
    websiteUrl: s.websiteUrl,
    registrationUrl: s.registrationUrl,
    registrationDeadline: s.registrationDeadline ? s.registrationDeadline.toISOString() : null,
    priority: s.priority,
    status: s.status,
    boothInfo: s.boothInfo,
    estimatedCost: s.estimatedCost,
    notes: s.notes,
    attendees: s.attendees.map((a) => ({
      memberId: a.memberId,
      name: a.member.name,
      status: a.status,
      role: a.role,
    })),
  }));

  return (
    <div className="min-h-screen bg-brand-greenTint">
      <Navbar active="/trade-shows" />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <p className="kicker mb-1">[ Z1POWER ]</p>
          <h1 className="font-heading text-3xl font-extrabold text-brand-ink">Trade Shows</h1>
          <p className="text-sm text-brand-inkSoft mt-1">
            Industry events, who&rsquo;s covering them, and what&rsquo;s coming up.
          </p>
        </div>
        <TradeShowsHub
          shows={items}
          teamMembers={teamMembers}
          currentMemberId={me.id}
          canManage={canManage}
          isAdmin={isAdmin}
          accessRows={accessMembers.map((m) => ({
            id: m.id,
            name: m.name,
            canView: m.canViewTradeShows,
            canManage: m.canManageTradeShows,
            isAdmin: m.role === "ADMIN",
          }))}
        />
      </main>
    </div>
  );
}
