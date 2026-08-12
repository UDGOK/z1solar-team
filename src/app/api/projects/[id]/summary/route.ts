import { NextResponse } from "next/server";
import { requirePageAuth } from "@/lib/auth";
import { loadProjectForPdf, renderProjectSummaryPdf, pdfFilename } from "@/lib/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  await requirePageAuth(); // redirects to /login if not authenticated

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
