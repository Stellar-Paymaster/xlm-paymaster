import type { Metadata } from "next";
import { getPortalLinks } from "@/lib/portal-links";
import { loadSdkRegistry } from "@/lib/sdk-registry";
import { SdkRegistry } from "@/components/developer-portal/SdkRegistry";

export async function generateMetadata(): Promise<Metadata> {
  const { siteUrl } = getPortalLinks();
  const title = "Paymaster SDK Registry";
  const description =
    "Download and explore all official Paymaster SDKs for TypeScript, Python, Go, React, and Vue — with version history, changelogs, and API docs.";

  return {
    title,
    description,
    keywords: ["Paymaster", "SDK", "TypeScript", "Python", "Go", "React", "Vue", "Stellar", "changelog"],
    metadataBase: new URL(siteUrl),
    alternates: { canonical: "/sdk" },
    openGraph: { title, description, url: `${siteUrl}/sdk`, siteName: "Paymaster", type: "website" },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

export default function SdkPage() {
  const sdks = loadSdkRegistry();
  return <SdkRegistry sdks={sdks} />;
}
