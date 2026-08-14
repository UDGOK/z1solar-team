import { NextResponse } from "next/server";
import { requirePageAuth } from "@/lib/auth";
import { getGlobalCapabilities } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { readPrivateBlob } from "@/lib/blobPrivate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same authenticated-proxy pattern as project files — private blob, no raw URL. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requirePageAuth();
  const caps = await getGlobalCapabilities(me);
  if (me.role !== "ADMIN" && !caps.canViewResources) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const item = await prisma.resource.findUnique({ where: { id } });
  if (!item || item.kind !== "FILE" || !item.pathname) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let blob;
  try {
    blob = await readPrivateBlob(item.pathname);
  } catch (e) {
    console.error("[resource proxy] blob read failed:", e);
    return NextResponse.json({ error: "Couldn't retrieve the file." }, { status: 502 });
  }
  if (!blob) return NextResponse.json({ error: "File not found in storage." }, { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(blob.stream as any, {
    headers: {
      "Content-Type": item.contentType || "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${(item.filename ?? "file").replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
