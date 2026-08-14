import * as Sentry from "@sentry/nextjs";
import { requirePageAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Deliberately throws, so an admin can confirm Sentry is actually receiving
 * events after connecting it — visit this once, then check your Sentry
 * dashboard for the error. Safe to leave in; it does nothing unless visited.
 *
 * Explicitly captures + flushes rather than relying on automatic
 * instrumentation to catch a Route Handler throw. On Vercel, a serverless
 * function can freeze the instant its response is sent — Sentry's report is
 * sent asynchronously in the background, so without an explicit flush the
 * function can terminate before that network call completes and the event
 * never arrives, even though the error genuinely happened.
 */
export async function GET() {
  await requirePageAdmin();

  const error = new Error("Sentry test error — if you see this in your Sentry dashboard, monitoring is working.");
  Sentry.captureException(error);
  await Sentry.flush(2000);

  throw error;
}
