export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Next 15's hook for errors thrown during server rendering (Server
// Components, layouts) that wouldn't otherwise reach a try/catch — this is
// what would have caught the React error #31 render failure automatically.
//
// Explicitly flushes after capturing. Vercel serverless functions can freeze
// the instant a response is sent, and Sentry reports over the network
// asynchronously — without waiting for the flush to complete, an event can
// be silently dropped even though automatic instrumentation "caught" it.
export const onRequestError = async (...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) => {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
  await Sentry.flush(2000);
};
