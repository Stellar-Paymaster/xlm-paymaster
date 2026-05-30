import type { NextConfig } from "next";

const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL ?? "";

const nextConfig: NextConfig = {
  // Serve static assets from the CDN origin when NEXT_PUBLIC_CDN_URL is set.
  // In production, point this at your Cloudflare / CloudFront distribution URL.
  // Leave unset for local development — Next.js serves assets from the local origin.
  assetPrefix: cdnUrl || undefined,

  images: {
    // Allow the CDN origin to serve optimised images.
    // Add your CDN hostname here so Next.js Image accepts src URLs from it.
    remotePatterns: cdnUrl
      ? [
          {
            protocol: "https",
            hostname: new URL(cdnUrl).hostname,
          },
        ]
      : [],
    // Delegate image optimisation to the CDN when a URL is configured.
    // The CDN caches the optimised output; Next.js only generates it once.
    loader: cdnUrl ? "custom" : "default",
    loaderFile: cdnUrl ? "./lib/cdn-image-loader.ts" : undefined,
  },

  // Set long-lived cache-control headers on immutable static assets.
  // _next/static/ files include a content hash in their filenames, so it is
  // safe to cache them for 1 year. Dynamic routes and API responses are
  // excluded from this rule and rely on their own cache directives.
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Favicon and manifest — cache for 1 day with revalidation.
        source: "/(favicon.ico|manifest.json|robots.txt)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
