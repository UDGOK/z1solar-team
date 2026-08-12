/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // @react-pdf/renderer reads font (.ttf) and logo (.png) files from the
  // filesystem at request time. Next.js's serverless bundler can't trace
  // that dependency statically, so without this the build works locally
  // but the files go missing once deployed to Vercel.
  //
  // Next 15 moved this out of `experimental` to the top level. While it was
  // nested it was silently ignored, which would have broken PDF generation
  // in production even though the build succeeded.
  outputFileTracingIncludes: {
    "/**": ["./src/lib/pdf/fonts/**/*", "./public/logo.png"],
  },
};

module.exports = nextConfig;
