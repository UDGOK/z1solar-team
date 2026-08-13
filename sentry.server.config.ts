import * as Sentry from "@sentry/nextjs";

// Catches errors in server components, server actions, and API routes — this
// is the half that matters most for this app. Every failure we chased
// manually this session (PDF render errors, blob storage 500s) would have
// shown up here automatically instead of needing a diagnostic endpoint.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});
