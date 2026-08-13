const path = require("path");
const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },

  // Keep @react-pdf and its native-ish deps out of the webpack bundle so Node
  // require()s them at runtime from node_modules. This guarantees a single
  // React instance — bundling gave react-pdf its own copy, and elements made
  // by one React aren't recognised by the other ("Minified React error #31",
  // which surfaced as a 500 with an empty body that browsers saved as .txt).
  serverExternalPackages: [
    "@react-pdf/renderer",
    "@react-pdf/pdfkit",
    "@react-pdf/font",
    "@react-pdf/layout",
    "@react-pdf/render",
    "@react-pdf/textkit",
    "@react-pdf/image",
    "@react-pdf/reconciler",
    "fontkit",
  ],

  webpack: (config, { isServer }) => {
    if (isServer) {
      // @react-pdf/renderer ships a "browser" field that remaps
      // lib/react-pdf.js -> lib/react-pdf.browser.js. If webpack honours that
      // in the server build, the BROWSER renderer runs on the server and fails.
      // Force Node resolution order and pin the entry to the Node build.
      config.resolve.mainFields = ["module", "main"];
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        "@react-pdf/renderer": path.resolve(
          __dirname,
          "node_modules/@react-pdf/renderer/lib/react-pdf.js"
        ),
      };
    }
    return config;
  },
};

// withSentryConfig wraps the config above — it composes with our custom
// `webpack` function rather than replacing it, so the react-pdf fix above
// still applies. Source map upload only runs when SENTRY_AUTH_TOKEN is set
// (added automatically once you connect Sentry via the Vercel Marketplace
// integration); without it this wrapper is a no-op passthrough, so local
// builds and builds before Sentry is connected are unaffected.
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  // Strips Sentry's own debug console logs from the client bundle.
  webpack: { treeshake: { removeDebugLogging: true } },
  // Don't fail the build if Sentry isn't connected yet or a source-map
  // upload has a hiccup — deploys should never depend on monitoring being
  // configured.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
