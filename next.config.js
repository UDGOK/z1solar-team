/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // @react-pdf/renderer reads font (.ttf) and logo (.png) files from the
  // filesystem at request time. Next.js's serverless bundler can't trace
  // that dependency statically, so without this, the build works locally
  // but the files go missing once deployed to Vercel. This forces them in.
  experimental: {
    outputFileTracingIncludes: {
      "/**": ["./src/lib/pdf/fonts/**/*", "./public/logo.png"],
    },
  },
};

module.exports = nextConfig;
