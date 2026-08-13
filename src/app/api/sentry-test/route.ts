import { requirePageAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Deliberately throws, so an admin can confirm Sentry is actually receiving
 * events after connecting it — visit this once, then check your Sentry
 * dashboard for the error. Safe to leave in; it does nothing unless visited.
 */
export async function GET() {
  await requirePageAdmin();
  throw new Error("Sentry test error — if you see this in your Sentry dashboard, monitoring is working.");
}
