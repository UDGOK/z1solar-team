/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },

  // Keep @react-pdf/renderer OUT of the webpack bundle.
  //
  // When Next bundles it, react-pdf ends up with its own copy of React. The
  // route then creates elements with one React instance and renders them with
  // another, which React rejects as invalid — surfacing as the cryptic
  // "Minified React error #31" and a 500 with an empty body (the browser saves
  // that empty response as a .txt file).
  //
  // Listing it here makes Node require it at runtime from node_modules, so
  // there is exactly one React instance.
  serverExternalPackages: ["@react-pdf/renderer", "@react-pdf/pdfkit", "@react-pdf/font", "@react-pdf/layout", "@react-pdf/render", "@react-pdf/textkit", "@react-pdf/image", "fontkit"],

  // Fonts and logo are embedded as base64 (see src/lib/pdf/fontData.ts), so no
  // file tracing is needed for them any more. Kept minimal deliberately.
};

module.exports = nextConfig;
