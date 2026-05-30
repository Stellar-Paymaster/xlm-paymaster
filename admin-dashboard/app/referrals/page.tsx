import type { Metadata } from "next";
import Link from "next/link";
import { getReferralData } from "@/lib/referral-data";
import { getPortalLinks } from "@/lib/portal-links";
import { ReferralDashboard } from "@/components/developer-portal/ReferralDashboard";

export const metadata: Metadata = {
  title: "Referral Program — Fluid",
  description: "Invite developers to Fluid and earn 1,000 stroops of XLM quota for every successful referral.",
  robots: { index: false, follow: false },
};

// Default to the sample tenant for the portal demo.
// In a real multi-tenant setup this would come from the session.
const DEMO_TENANT_ID = "anchor-west";

export default function ReferralsPage() {
  const { siteUrl } = getPortalLinks();
  const data = getReferralData(DEMO_TENANT_ID);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Referral programme
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
            Invite developers, earn quota
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Share your unique referral link. When a developer you invite signs up and
            completes their first fee-bump, you automatically receive{" "}
            <span className="font-semibold text-foreground">1,000 stroops</span> of
            bonus XLM quota.
          </p>
          <div className="mt-4">
            <Link
              href="/"
              className="text-sm font-medium text-primary hover:underline"
            >
              ← Back to portal
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <ReferralDashboard data={data} siteUrl={siteUrl} />
      </div>
    </div>
  );
}
