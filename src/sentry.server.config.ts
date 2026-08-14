import * as Sentry from "@sentry/nextjs";

// Catches errors in server components, server actions, and API routes — this
// is the half that matters most for this app. Every failure we chased
// manually this session (PDF render errors, blob storage 500s) would have
// shown up here automatically instead of needing a diagnostic endpoint.
//
// Falls back to NEXT_PUBLIC_SENTRY_DSN if the plain SENTRY_DSN isn't set —
// the Vercel-Sentry integration doesn't always provision both, and a DSN
// isn't a secret (it's designed to be embedded in public client bundles), so
// reusing the public one here is safe. Without this fallback, Sentry.init()
// silently no-ops with an undefined DSN and nothing server-side ever gets
// reported, even though the code "looks" wired up correctly.
Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});
