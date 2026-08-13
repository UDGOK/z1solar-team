const path = require("path");

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

module.exports = nextConfig;
