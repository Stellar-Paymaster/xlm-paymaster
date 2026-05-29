// Custom Next.js image loader that rewrites src URLs to use the CDN origin.
// Activated only when NEXT_PUBLIC_CDN_URL is set (see next.config.ts).
//
// Cloudflare Images / CloudFront pass width and quality as query params.
// Adjust the URL template below if your CDN uses a different convention.

interface ImageLoaderProps {
  src: string;
  width: number;
  quality?: number;
}

export default function cdnImageLoader({ src, width, quality }: ImageLoaderProps): string {
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL ?? "";
  const base = cdnUrl.replace(/\/$/, "");
  const path = src.startsWith("/") ? src : `/${src}`;
  const q = quality ?? 75;
  return `${base}${path}?w=${width}&q=${q}`;
}
