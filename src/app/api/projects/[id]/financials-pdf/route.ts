import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { requirePageAuth } from "@/lib/auth";
import { getProjectPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { FinancialLedgerDocument } from "@/lib/pdf/FinancialLedgerDocument";
// Importing the summary document registers the shared Poppins/Montserrat
// fonts with @react-pdf — without this the ledger PDF falls back to Helvetica.
import "@/lib/pdf/ProjectSummaryDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const member = await requirePageAuth();
  const perms = await getProjectPermissions(member, params.id);
  if (!perms.canViewFinancials) {
    return NextResponse.json({ error: "You don't have financial access to this project." }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { lineItems: { orderBy: { order: "asc" } } },
  });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const el = React.createElement(FinancialLedgerDocument, {
    projectTitle: project.title,
    lines: project.lineItems,
    generatedAt: new Date(),
  });
  const buffer = await renderToBuffer(el as any);

  const safe = project.title.replace(/[^a-z0-9\-_ ]/gi, "").trim().replace(/\s+/g, "-");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safe || "Project"}-Financial-Ledger.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
