import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { prisma } from "@/lib/prisma";
import { ProjectSummaryDocument, type PdfProject } from "./ProjectSummaryDocument";
import { registerPdfFonts } from "./fonts";

export async function loadProjectForPdf(projectId: string): Promise<PdfProject | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      lead: true,
      members: { include: { member: true } },
      talkingPoints: { orderBy: { order: "asc" } },
      keyDates: { orderBy: { order: "asc" } },
      todos: {
        orderBy: { order: "asc" },
        include: {
          assignees: { include: { member: { select: { name: true } } } },
          completedBy: { select: { name: true } },
          confirmedBy: { select: { name: true } },
          sourceMeeting: { select: { title: true } },
        },
      },
    },
  });
  if (!project) return null;
  return project;
}

export async function renderProjectSummaryPdf(project: PdfProject): Promise<Buffer> {
  // Explicit, not an import side effect — see fonts.ts for why.
  registerPdfFonts();
  // renderToBuffer's TS signature wants a ReactElement<DocumentProps> directly;
  // ProjectSummaryDocument is a wrapper component whose own props type differs,
  // even though it resolves to a <Document> at render time. Verified working via
  // direct render + pdftoppm visual inspection, so this cast just satisfies tsc.
  const element = React.createElement(ProjectSummaryDocument, { project, generatedAt: new Date() });
  const buffer = await renderToBuffer(element as unknown as React.ReactElement<any>);
  return buffer;
}

export function pdfFilename(title: string): string {
  const safe = title.replace(/[^a-z0-9\-_ ]/gi, "").trim().replace(/\s+/g, "-");
  return `${safe || "Project"}-Summary.pdf`;
}
