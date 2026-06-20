import "server-only";
import type { WebhookTenantSettings } from "@/components/dashboard/types";

const SAMPLE_WEBHOOK_SETTINGS: WebhookTenantSettings[] = [
  {
    tenantId: "anchor-west",
    tenantName: "Anchor West",
    webhookUrl: "https://anchor-west.example.com/webhooks/paymaster",
    eventTypes: ["tx.success", "tx.failed", "balance.low"],
    updatedAt: new Date("2026-03-20T09:00:00.000Z").toISOString(),
  },
  {
    tenantId: "mobile-wallet",
    tenantName: "Mobile Wallet",
    webhookUrl: "https://wallet.example.com/paymaster/webhooks",
    eventTypes: ["tx.success", "tx.failed"],
    updatedAt: new Date("2026-03-21T10:30:00.000Z").toISOString(),
  },
  {
    tenantId: "market-maker",
    tenantName: "Market Maker",
    webhookUrl: null,
    eventTypes: ["tx.success", "tx.failed", "balance.low"],
    updatedAt: new Date("2026-03-18T08:15:00.000Z").toISOString(),
  },
];

export interface WebhookSettingsPageData {
  rows: WebhookTenantSettings[];
  source: "live" | "sample";
}

export async function getWebhookSettingsPageData(): Promise<WebhookSettingsPageData> {
  const serverUrl = process.env.PAYMASTER_SERVER_URL?.replace(/\/$/, "") ?? "";
  const adminToken = process.env.PAYMASTER_ADMIN_TOKEN ?? "";

  if (!serverUrl || !adminToken) {
    return { rows: SAMPLE_WEBHOOK_SETTINGS, source: "sample" };
  }

  try {
    const res = await fetch(`${serverUrl}/admin/webhooks`, {
      cache: "no-store",
      headers: {
        "x-admin-token": adminToken,
      },
    });

    if (!res.ok) {
      throw new Error(`Status ${res.status}`);
    }

    const data = await res.json();
    return {
      rows: (data.tenants ?? []) as WebhookTenantSettings[],
      source: "live",
    };
  } catch {
    return { rows: SAMPLE_WEBHOOK_SETTINGS, source: "sample" };
  }
}
