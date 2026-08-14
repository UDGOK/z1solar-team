import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGlobalCapabilities, getViewableProjectIds } from "@/lib/permissions";
import { PAGE_CONTAINER } from "@/lib/layout";
import AppShell from "@/components/AppShell";
import MeetingsHub from "@/components/MeetingsHub";
import type { MeetingItem } from "@/components/MeetingCard";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const me = await requirePageAuth();
  const isAdmin = me.role === "ADMIN";
  const caps = await getGlobalCapabilities(me);

  if (!isAdmin && !caps.canViewMeetings) notFound();

  const viewableIds = await getViewableProjectIds(me);
  const [meetings, teamMembers, projects] = await Promise.all([
    prisma.meeting.findMany({
      include: {
        organizer: { select: { name: true } },
        project: { select: { title: true } },
        agendaItems: { orderBy: { order: "asc" }, include: { owner: { select: { name: true } } } },
        attendees: { include: { member: { select: { id: true, name: true } } } },
      },
      orderBy: { startsAt: "desc" },
    }),
    prisma.teamMember.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.project.findMany({
      where: { archived: false, id: { in: viewableIds } },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  const items: MeetingItem[] = meetings.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    startsAt: m.startsAt.toISOString(),
    durationMins: m.durationMins,
    location: m.location,
    joinUrl: m.joinUrl,
    status: m.status,
    notes: m.notes,
    notesBy: m.notesBy,
    notesAt: m.notesAt ? m.notesAt.toISOString() : null,
    organizerName: m.organizer?.name ?? null,
    projectTitle: m.project?.title ?? null,
    agenda: m.agendaItems.map((a) => ({ id: a.id, text: a.text, covered: a.covered, ownerName: a.owner?.name ?? null })),
    attendees: m.attendees.map((a) => ({ memberId: a.memberId, name: a.member.name, status: a.status, canEditNotes: a.canEditNotes })),
  }));

  // Note-taking rights resolved per meeting: global role capability, being the
  // organiser, or an explicit per-meeting grant.
  const noteRights: Record<string, boolean> = {};
  for (const m of meetings) {
    const attendee = m.attendees.find((a) => a.memberId === me.id);
    noteRights[m.id] = isAdmin || caps.canTakeMeetingNotes || m.organizerId === me.id || !!attendee?.canEditNotes;
  }

  return (
    <AppShell active="/meetings">
      <main className={PAGE_CONTAINER}>
        <div className="mb-5">
          <p className="text-[8.5px] font-semibold tracking-[0.14em] text-brand-green">[ Z1POWER ]</p>
          <h1 className="font-heading font-extrabold text-[20px] sm:text-[22px] text-brand-ink tracking-tight mt-0.5">Meetings</h1>
          <p className="text-[11px] text-brand-inkSoft mt-0.5">Agendas before, notes after, and who&rsquo;s attending.</p>
        </div>
        <MeetingsHub
          meetings={items}
          teamMembers={teamMembers}
          projects={projects}
          currentMemberId={me.id}
          canManage={isAdmin || caps.canManageMeetings}
          noteRights={noteRights}
        />
      </main>
    </AppShell>
  );
}
