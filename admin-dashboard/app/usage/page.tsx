import type { Metadata } from "next";

import { TenantUsageDashboard } from "@/components/developer-portal/TenantUsageDashboard";
import { getPortalLinks } from "@/lib/portal-links";

export async function generateMetadata(): Promise<Metadata> {
  const { siteUrl } = getPortalLinks();
  const title = "Usage dashboard · Fluid";
  const description =
    "Monitor your Fluid API usage: monthly volume, daily quota, and recent transactions.";

  return {
    title,
    description,
    metadataBase: new URL(siteUrl),
    alternates: { canonical: "/usage" },
    robots: { index: true, follow: true },
  };
}

export default function UsagePage() {
  return <TenantUsageDashboard />;
}
