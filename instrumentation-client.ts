import * as Sentry from "@sentry/nextjs";

// SENTRY_DSN is auto-injected once you connect Sentry via the Vercel
// Marketplace integration. Until then this file loads but Sentry.init()
// no-ops safely with an empty DSN — nothing breaks locally or in a build
// that hasn't connected Sentry yet.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Keep this modest — captures a sample of normal traffic for performance
  // insight without ballooning event volume/cost on a 9-person internal tool.
  tracesSampleRate: 0.1,
  // Record a session replay only for the sessions that actually errored —
  // gives a "what did the user see" replay for debugging without recording
  // everyone all the time.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
  environment: process.env.NODE_ENV,
});

// Reports page-to-page navigations as breadcrumbs, so an error report shows
// which pages someone visited leading up to it, not just the final crash.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
