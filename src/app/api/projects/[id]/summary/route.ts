import { NextResponse } from "next/server";
import { requirePageAuth } from "@/lib/auth";
import { getProjectPermissions } from "@/lib/permissions";
import { loadProjectForPdf, renderProjectSummaryPdf, pdfFilename } from "@/lib/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const member = await requirePageAuth();
  const perms = await getProjectPermissions(member, params.id);
  if (!perms.canViewFinancials) {
    return NextResponse.json({ error: "You don't have financial access to this project." }, { status: 403 });
  }

  const project = await loadProjectForPdf(params.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const buffer = await renderProjectSummaryPdf(project);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFilename(project.title)}"`,
      "Cache-Control": "no-store",
    },
  });
}
