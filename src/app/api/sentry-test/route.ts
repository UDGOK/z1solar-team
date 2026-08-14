import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { requirePageAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Diagnostic + deliberate error, in one. Rather than just throwing and hoping
 * the event lands, this reports exactly what the Sentry client sees at
 * runtime — whether a DSN resolved, whether a client is actually bound, and
 * whether the send was accepted. Guessing from config alone has been wrong
 * three times; this reports ground truth from inside the running function.
 */
export async function GET() {
  await requirePageAdmin();

  const dsnFromServer = process.env.SENTRY_DSN;
  const dsnFromPublic = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const resolved = dsnFromServer || dsnFromPublic;

  // Is a Sentry client actually initialized in this runtime?
  const client = Sentry.getClient();
  const clientDsn = client?.getDsn();

  let eventId: string | undefined;
  let flushed: boolean | undefined;
  let sendError: string | null = null;

  try {
    eventId = Sentry.captureException(
      new Error("Sentry test error — if you see this in your Sentry dashboard, monitoring is working.")
    );
    flushed = await Sentry.flush(5000);
  } catch (e: any) {
    sendError = e?.message ?? String(e);
  }

  return NextResponse.json({
    verdict: !resolved
      ? "NO DSN — neither SENTRY_DSN nor NEXT_PUBLIC_SENTRY_DSN is readable in this runtime."
      : !client
      ? "DSN present but NO SENTRY CLIENT — Sentry.init() never ran in this runtime (instrumentation not loading)."
      : !eventId
      ? "Client exists but captureException returned no event id — event was dropped before send."
      : flushed === false
      ? "Event captured but flush timed out — send did not complete."
      : "Event captured and flushed. It should appear in Sentry Issues within ~30s.",
    env: {
      SENTRY_DSN_present: !!dsnFromServer,
      NEXT_PUBLIC_SENTRY_DSN_present: !!dsnFromPublic,
      // Host only — never echo the full DSN back in a response.
      resolvedDsnHost: resolved ? (() => { try { return new URL(resolved).host; } catch { return "unparseable"; } })() : null,
    },
    sentryClient: {
      initialized: !!client,
      clientDsnHost: clientDsn ? `${clientDsn.host}` : null,
      environment: client?.getOptions()?.environment ?? null,
      release: client?.getOptions()?.release ?? null,
    },
    send: { eventId: eventId ?? null, flushed: flushed ?? null, sendError },
    runtime: { nextRuntime: process.env.NEXT_RUNTIME ?? "nodejs", vercelEnv: process.env.VERCEL_ENV ?? null },
  });
}
