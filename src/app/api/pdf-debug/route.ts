import { NextResponse } from "next/server";
import { requirePageAdmin } from "@/lib/auth";
import { fontDiagnostics, findLogoPath, registerPdfFonts } from "@/lib/pdf/fonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only diagnostic for PDF generation. Reports where the runtime is
 * looking for fonts and the logo, and whether an actual render succeeds —
 * so a failure gives a real answer instead of a downloaded error page.
 */
export async function GET() {
  await requirePageAdmin();

  const diag = fontDiagnostics();
  const logo = findLogoPath();

  let registerOk = false;
  let registerError: string | null = null;
  try {
    registerPdfFonts();
    registerOk = true;
  } catch (e: any) {
    registerError = e?.message ?? String(e);
  }

  let renderOk = false;
  let renderError: string | null = null;
  let pdfBytes = 0;
  let signature = "";
  if (registerOk) {
    try {
      const React = (await import("react")).default;
      const { renderToBuffer } = await import("@react-pdf/renderer");
      const { ProjectSummaryDocument } = await import("@/lib/pdf/ProjectSummaryDocument");
      const sample: any = {
        title: "Diagnostic", category: "Test", status: "On Track", completionPct: 50,
        lead: { name: "Test", title: null }, members: [], talkingPoints: [], keyDates: [], todos: [],
        estBudget: 0, committed: 0, actualSpend: 0, q3Proj: 0, q4Proj: 0, q1Proj: 0, q2Proj: 0, notes: null,
      };
      const buf = await renderToBuffer(
        React.createElement(ProjectSummaryDocument, { project: sample, generatedAt: new Date() }) as any
      );
      pdfBytes = buf.length;
      signature = buf.subarray(0, 5).toString();
      renderOk = signature === "%PDF-";
    } catch (e: any) {
      renderError = e?.message ?? String(e);
    }
  }

  return NextResponse.json(
    {
      summary: renderOk ? "PDF generation is working." : "PDF generation is FAILING — see errors below.",
      registerOk, registerError,
      renderOk, renderError, pdfBytes, signature,
      logoFound: logo, cwd: diag.cwd, dirname: diag.dirname, resolvedFontDir: diag.resolvedDir,
      pathsTried: diag.tried,
    },
    { status: 200 }
  );
}
