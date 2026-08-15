import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getExhibitorAccess } from "@/lib/exhibitors/access";
import { MeetingTargetListDocument, type TargetRow } from "@/lib/pdf/MeetingTargetListDocument";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { formatDateRange, formatInstantDate } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The printable meeting target list for one show.
 *
 * `?all=1` includes every exhibitor rather than only the flagged ones — useful
 * as a floor directory, but the default is the flagged set, because a 811-row
 * printout is not something anyone carries.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requirePageAuth();

  const access = await getExhibitorAccess(me, id);
  if (!access.canView) {
    return NextResponse.json({ error: "You don't have access to this show." }, { status: 403 });
  }

  const show = await prisma.tradeShow.findUnique({
    where: { id },
    select: {
      name: true, startDate: true, endDate: true,
      venue: true, city: true, state: true, boothInfo: true,
    },
  });
  if (!show) return NextResponse.json({ error: "Trade show not found." }, { status: 404 });

  const all = new URL(req.url).searchParams.get("all") === "1";

  const rows = await prisma.tradeShowExhibitor.findMany({
    where: { tradeShowId: id, ...(all ? {} : { meetingWanted: true }) },
    include: {
      vendor: {
        select: {
          name: true, description: true,
          reputationScore: true, riskSource: true,
        },
      },
      owners: { include: { member: { select: { name: true } } } },
      projects: { include: { project: { select: { title: true } } } },
    },
  });

  const targets: TargetRow[] = rows.map((r) => ({
    booth: r.booth,
    hall: r.hall,
    company: r.vendor.name,
    // Trimmed hard: this has to fit a printed row, and a 300-word portal blurb
    // makes the sheet unreadable.
    description: r.vendor.description ? truncate(r.vendor.description, 90) : null,
    listing: r.listing,
    sponsorTier: r.sponsorTier,
    want: r.notes ? truncate(r.notes, 120) : null,
    projects: r.projects.map((p) => p.project.title),
    owners: r.owners.map((o) => o.member.name),
    meetingStatus: r.meetingStatus,
    reputationScore: r.vendor.reputationScore,
    riskVerified: r.vendor.riskSource === "manual",
  }));

  // Show dates are calendar dates (UTC); "generated on" is an instant (Central).
  const when = formatDateRange(show.startDate, show.endDate);

  registerPdfFonts();

  const el = React.createElement(MeetingTargetListDocument, {
    showName: show.name,
    showWhen: when,
    showWhere: [show.venue, show.city, show.state].filter(Boolean).join(", "),
    ourBooth: show.boothInfo,
    generatedOn: formatInstantDate(new Date()),
    rows: targets,
  });

  const buffer = await renderToBuffer(el as any);
  const safe = show.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type": "application/pdf",
      // `inline` so it opens in the browser's viewer — people check it before
      // printing far more often than they save it.
      "Content-Disposition": `inline; filename="${safe}-${all ? "all-exhibitors" : "target-list"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
}
