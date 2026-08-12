import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const authed = await isAuthenticated();
        if (!authed) {
          throw new Error("Not authenticated.");
        }
        return {
          allowedContentTypes: [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain",
            "text/csv",
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/gif",
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 25 * 1024 * 1024, // 25MB
        };
      },
      onUploadCompleted: async () => {
        // Metadata is saved via the attachFileToProject server action right after
        // the client upload resolves, so nothing to do here. (This webhook also
        // doesn't fire on localhost, so we don't rely on it.)
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
