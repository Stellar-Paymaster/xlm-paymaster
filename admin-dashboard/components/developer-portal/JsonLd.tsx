import { getPortalLinks } from "@/lib/portal-links";

export function JsonLd() {
  const { siteUrl } = getPortalLinks();
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Paymaster Developer Portal",
    description:
      "Gasless Stellar transactions with Paymaster: fee sponsorship, multi-asset flows, and Soroban smart contracts.",
    url: siteUrl,
    publisher: {
      "@type": "Organization",
      name: "Paymaster",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
