import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readPrivateBlob } from "@/lib/blobPrivate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deliberately NOT behind requirePageAuth — this is the "Get Shareable Link"
 * feature, meant to work for someone outside the app (an external
 * stakeholder pasted this link in an email). Access is gated by possessing
 * the random token instead of a login, and by expiry.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = await prisma.sharedLink.findUnique({ where: { token } });
  if (!link) return NextResponse.json({ error: "This link is invalid." }, { status: 404 });

  if (link.expiresAt && link.expiresAt < new Date()) {
    return NextResponse.json({ error: "This link has expired. Ask for a fresh one." }, { status: 410 });
  }

  let blob;
  try {
    blob = await readPrivateBlob(link.pathname);
  } catch (e) {
    console.error("[shared link] blob read failed:", e);
    return NextResponse.json({ error: "Couldn't retrieve the file." }, { status: 502 });
  }
  if (!blob) return NextResponse.json({ error: "File not found." }, { status: 404 });

  return new NextResponse(blob.stream as any, {
    headers: {
      "Content-Type": link.contentType,
      "Content-Disposition": `inline; filename="${link.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
