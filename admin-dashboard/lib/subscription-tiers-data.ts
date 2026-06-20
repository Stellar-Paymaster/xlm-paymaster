import "server-only";

import type {
  SubscriptionTier,
  SubscriptionTierPageData,
  TenantTierSummary,
} from "@/components/dashboard/types";

const SAMPLE_TIERS: SubscriptionTier[] = [
  {
    id: "tier-free",
    name: "Free",
    code: "free",
    txLimit: 10,
    rateLimit: 5,
    priceMonthly: 0,
  },
  {
    id: "tier-pro",
    name: "Pro",
    code: "pro",
    txLimit: 1000,
    rateLimit: 60,
    priceMonthly: 4900,
  },
  {
    id: "tier-enterprise",
    name: "Enterprise",
    code: "enterprise",
    txLimit: 100000,
    rateLimit: 300,
    priceMonthly: 19900,
  },
];

const SAMPLE_TENANTS: TenantTierSummary[] = [
  {
    id: "anchor-west",
    name: "Anchor West",
    subscriptionTierId: "tier-free",
    subscriptionTier: SAMPLE_TIERS[0],
  },
  {
    id: "mobile-wallet",
    name: "Mobile Wallet",
    subscriptionTierId: "tier-pro",
    subscriptionTier: SAMPLE_TIERS[1],
  },
  {
    id: "market-maker",
    name: "Market Maker",
    subscriptionTierId: "tier-enterprise",
    subscriptionTier: SAMPLE_TIERS[2],
  },
];

export async function getSubscriptionTierPageData(): Promise<SubscriptionTierPageData> {
  const serverUrl = process.env.PAYMASTER_SERVER_URL?.trim().replace(/\/$/, "") ?? "";
  const adminToken = process.env.PAYMASTER_ADMIN_TOKEN?.trim() ?? "";

  if (!serverUrl || !adminToken) {
    return {
      tiers: SAMPLE_TIERS,
      tenants: SAMPLE_TENANTS,
      tenant: SAMPLE_TENANTS[0],
      source: "sample",
    };
  }

  try {
    const response = await fetch(`${serverUrl}/admin/subscription-tiers`, {
      cache: "no-store",
      headers: {
        "x-admin-token": adminToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }

    const payload = (await response.json()) as Omit<SubscriptionTierPageData, "source">;
    return {
      ...payload,
      source: "live",
    };
  } catch {
    return {
      tiers: SAMPLE_TIERS,
      tenants: SAMPLE_TENANTS,
      tenant: SAMPLE_TENANTS[0],
      source: "sample",
    };
  }
}
