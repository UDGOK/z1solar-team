import * as Sentry from "@sentry/nextjs";

// Middleware and any edge-runtime routes use this instead of server.config.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});
