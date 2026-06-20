import type { Metadata } from "next";

import { DeveloperPortalLanding } from "@/components/developer-portal/DeveloperPortalLanding";
import { JsonLd } from "@/components/developer-portal/JsonLd";
import { getPortalLinks } from "@/lib/portal-links";

export async function generateMetadata(): Promise<Metadata> {
  const { siteUrl } = getPortalLinks();
  const title = "Paymaster Developer Portal";
  const description =
    "Build gasless Stellar applications with Paymaster: fee sponsorship, multi-asset support, and Soroban integration via the TypeScript SDK.";

  return {
    title,
    description,
    keywords: [
      "Stellar",
      "fee bump",
      "gasless",
      "Soroban",
      "Paymaster",
      "SDK",
      "developer",
    ],
    metadataBase: new URL(siteUrl),
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title,
      description,
      url: siteUrl,
      siteName: "Paymaster",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default function Home() {
  return (
    <>
      <JsonLd />
      <DeveloperPortalLanding />
    </>
  );
}
