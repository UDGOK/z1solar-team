import { NextResponse } from "next/server";
import { requirePageAuth } from "@/lib/auth";
import { getProjectPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { readPrivateBlob } from "@/lib/blobPrivate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The only way to actually see a project file's bytes. Blob storage is
 * Private, so there's no raw URL that works on its own — every view goes
 * through here, which re-checks real in-app permission (signed in, has
 * canViewFiles on that specific project) before ever touching the file.
 *
 * ?download=1 forces a Save-As dialog. Without it, PDFs and images render
 * inline — a PDF opened this way uses the browser's native viewer, which
 * supports printing directly (Ctrl+P) without ever leaving the site.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requirePageAuth();

  const file = await prisma.projectFile.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const perms = await getProjectPermissions(member, file.projectId);
  if (!perms.canViewFiles) {
    // Same response whether the file doesn't exist or they can't see it —
    // no reason to confirm to an unauthorized viewer that it exists at all.
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  let blob;
  try {
    blob = await readPrivateBlob(file.pathname);
  } catch (e) {
    console.error("[file proxy] blob read failed:", e);
    return NextResponse.json({ error: "Couldn't retrieve the file." }, { status: 502 });
  }
  if (!blob) return NextResponse.json({ error: "File not found in storage." }, { status: 404 });

  const url = new URL(request.url);
  const forceDownload = url.searchParams.get("download") === "1";
  const disposition = forceDownload ? "attachment" : "inline";
  const safeName = file.filename.replace(/"/g, "");

  return new NextResponse(blob.stream as any, {
    headers: {
      "Content-Type": file.contentType || blob.blob.contentType || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
