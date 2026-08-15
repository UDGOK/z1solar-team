import { notFound } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/AppShell";
import ExhibitorsHub from "@/components/ExhibitorsHub";
import { getExhibitorAccess } from "@/lib/exhibitors/access";
import { PAGE_CONTAINER } from "@/lib/layout";

export const dynamic = "force-dynamic";

export default async function ExhibitorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requirePageAuth();

  const show = await prisma.tradeShow.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      venue: true,
      city: true,
      state: true,
      boothInfo: true,
    },
  });
  if (!show) notFound();

  const access = await getExhibitorAccess(me, id);
  // No access behaves exactly like a 404 rather than announcing that this
  // show's exhibitor list exists — same rule as the trade shows page itself.
  if (!access.canView) notFound();

  const [rows, tags, projects, team] = await Promise.all([
    prisma.tradeShowExhibitor.findMany({
      where: { tradeShowId: id },
      include: {
        vendor: {
          include: {
            tags: { include: { tag: true } },
            contacts: true,
            // Every other show this company has appeared at — the reason
            // vendors are global rather than per-show.
            appearances: {
              where: { tradeShowId: { not: id } },
              include: { tradeShow: { select: { name: true, startDate: true } } },
              orderBy: { createdAt: "desc" },
              take: 5,
            },
          },
        },
        owner: { select: { id: true, name: true } },
        projects: { include: { project: { select: { id: true, title: true } } } },
        noteEntries: { orderBy: { createdAt: "desc" }, take: 20 },
      },
      orderBy: [{ meetingWanted: "desc" }, { booth: "asc" }, { vendor: { name: "asc" } }],
    }),
    prisma.vendorTag.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.project.findMany({
      where: { archived: false },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    prisma.teamMember.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const items = rows.map((r) => ({
    id: r.id,
    booth: r.booth,
    hall: r.hall,
    listing: r.listing,
    sponsorTier: r.sponsorTier,
    meetingWanted: r.meetingWanted,
    meetingStatus: r.meetingStatus,
    priority: r.priority,
    notes: r.notes,
    outcome: r.outcome,
    ownerId: r.ownerId,
    ownerName: r.owner?.name ?? null,
    vendor: {
      id: r.vendor.id,
      name: r.vendor.name,
      description: r.vendor.description,
      websiteUrl: r.vendor.websiteUrl,
      hqCountry: r.vendor.hqCountry,
      notes: r.vendor.notes,
      tagIds: r.vendor.tags.map((t) => t.tagId),
      tagNames: r.vendor.tags.map((t) => t.tag.name),
      contacts: r.vendor.contacts.map((c) => ({
        id: c.id,
        name: c.name,
        title: c.title,
        email: c.email,
        phone: c.phone,
      })),
      history: r.vendor.appearances.map((a) => ({
        showName: a.tradeShow.name,
        year: a.tradeShow.startDate.getUTCFullYear(),
        booth: a.booth,
        notes: a.notes,
        meetingStatus: a.meetingStatus,
      })),
    },
    projectIds: r.projects.map((p) => p.projectId),
    projectNames: r.projects.map((p) => p.project.title),
    noteEntries: r.noteEntries.map((n) => ({
      id: n.id,
      authorName: n.authorName,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
    })),
  }));

  const where = [show.venue, show.city, show.state].filter(Boolean).join(", ");
  const dates =
    show.endDate && show.endDate.getTime() !== show.startDate.getTime()
      ? `${show.startDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} – ${show.endDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`
      : show.startDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <AppShell active="/trade-shows">
      <main className={PAGE_CONTAINER}>
        <ExhibitorsHub
          showId={show.id}
          showName={show.name}
          showWhen={dates}
          showWhere={where}
          ourBooth={show.boothInfo}
          items={items}
          tags={tags.map((t) => ({ id: t.id, name: t.name }))}
          projects={projects}
          team={team}
          canManage={access.canManage}
          canAnnotate={access.canAnnotate}
        />
      </main>
    </AppShell>
  );
}
