import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer, Document, Page, Text, View } from "@react-pdf/renderer";
import { requirePageAdmin } from "@/lib/auth";
import { fontDiagnostics, registerPdfFonts } from "@/lib/pdf/fonts";
import { ProjectSummaryDocument } from "@/lib/pdf/ProjectSummaryDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Layered PDF diagnostic. Each stage isolates one possible cause, so a failure
 * tells us WHERE the problem is instead of just that one exists:
 *
 *   1. bare      — minimal doc, no fonts, no custom components
 *   2. withFonts — same doc but using our registered font families
 *   3. full      — the real ProjectSummaryDocument
 *
 * If (1) fails it's the library/React wiring. If (1) passes but (2) fails it's
 * font registration. If (1) and (2) pass but (3) fails it's our components.
 */
export async function GET() {
  await requirePageAdmin();

  const results: Record<string, any> = {};

  // React identity — duplicate React instances are the classic cause of #31.
  const el = React.createElement("div");
  results.reactIdentity = {
    version: React.version,
    elementSymbolMatches: (el as any).$$typeof === Symbol.for("react.element"),
    symbolDescription: String((el as any).$$typeof),
  };

  // Stage 1 — bare document, zero customisation
  try {
    const doc = React.createElement(
      Document,
      null,
      React.createElement(Page, { size: "LETTER" }, React.createElement(Text, null, "hello"))
    );
    const buf = await renderToBuffer(doc as any);
    results.stage1_bare = { ok: buf.subarray(0, 5).toString() === "%PDF-", bytes: buf.length };
  } catch (e: any) {
    results.stage1_bare = { ok: false, error: e?.message?.slice(0, 300) };
  }

  // Stage 2 — same, but exercising our registered fonts
  try {
    registerPdfFonts();
    const doc = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: "LETTER" },
        React.createElement(View, null, React.createElement(Text, { style: { fontFamily: "Poppins" } }, "hello"))
      )
    );
    const buf = await renderToBuffer(doc as any);
    results.stage2_withFonts = { ok: buf.subarray(0, 5).toString() === "%PDF-", bytes: buf.length };
  } catch (e: any) {
    results.stage2_withFonts = { ok: false, error: e?.message?.slice(0, 300) };
  }

  // Stage 3 — the real document component
  try {
    const sample: any = {
      title: "Diagnostic", category: "Test", status: "On Track", completionPct: 50,
      lead: { name: "Test", title: null }, members: [], talkingPoints: [], keyDates: [], todos: [],
      estBudget: 0, committed: 0, actualSpend: 0, q3Proj: 0, q4Proj: 0, q1Proj: 0, q2Proj: 0, notes: null,
    };
    const buf = await renderToBuffer(
      React.createElement(ProjectSummaryDocument, { project: sample, generatedAt: new Date() }) as any
    );
    results.stage3_realDocument = { ok: buf.subarray(0, 5).toString() === "%PDF-", bytes: buf.length };
  } catch (e: any) {
    results.stage3_realDocument = { ok: false, error: e?.message?.slice(0, 300) };
  }

  const diag = fontDiagnostics();
  const firstFailure =
    !results.stage1_bare?.ok ? "stage1_bare — library/React wiring"
    : !results.stage2_withFonts?.ok ? "stage2_withFonts — font registration"
    : !results.stage3_realDocument?.ok ? "stage3_realDocument — our document components"
    : null;

  return NextResponse.json(
    { summary: firstFailure ? `FAILING at ${firstFailure}` : "All stages passed — PDF generation works.", firstFailure, ...results, fonts: diag },
    { status: 200 }
  );
}
