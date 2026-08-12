import { NextResponse } from "next/server";
import { sendWeeklyReports } from "@/lib/weeklyReport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly digest cron. Vercel Cron calls this on the schedule in vercel.json
 * and includes an Authorization header matching CRON_SECRET.
 *
 * Protected because this endpoint sends real email — without a secret,
 * anyone hitting the URL could spam the whole team.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const appUrl = `${url.protocol}//${url.host}`;

  try {
    const result = await sendWeeklyReports(appUrl);
    return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
  } catch (e: any) {
    console.error("[cron] weekly reports failed:", e);
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
