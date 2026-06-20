import "server-only";
import type { ApiKey } from "@/components/dashboard/types";

const SAMPLE_API_KEYS: ApiKey[] = [
  {
    id: "sample-key-01",
    key: "flud...a1b2",
    prefix: "flud",
    tenantId: "anchor-west",
    active: true,
    allowedChains: ["stellar", "evm"],
    createdAt: new Date("2026-01-15").toISOString(),
    updatedAt: new Date("2026-01-15").toISOString(),
  },
  {
    id: "sample-key-02",
    key: "flud...c3d4",
    prefix: "flud",
    tenantId: "mobile-wallet",
    active: true,
    allowedChains: ["stellar"],
    createdAt: new Date("2026-02-20").toISOString(),
    updatedAt: new Date("2026-02-20").toISOString(),
  },
  {
    id: "sample-key-03",
    key: "flud...e5f6",
    prefix: "flud",
    tenantId: "market-maker",
    active: false,
    allowedChains: ["stellar", "evm", "solana", "cosmos"],
    createdAt: new Date("2026-03-01").toISOString(),
    updatedAt: new Date("2026-03-10").toISOString(),
  },
];

export interface ApiKeysPageData {
  keys: ApiKey[];
  source: "live" | "sample";
  serverUrl: string;
  adminToken: string;
}

export async function getApiKeysPageData(): Promise<ApiKeysPageData> {
  const serverUrl = process.env.PAYMASTER_SERVER_URL?.replace(/\/$/, "") ?? "";
  const adminToken = process.env.PAYMASTER_ADMIN_TOKEN ?? "";

  if (!serverUrl || !adminToken) {
    return { keys: SAMPLE_API_KEYS, source: "sample", serverUrl, adminToken };
  }

  try {
    const res = await fetch(`${serverUrl}/admin/api-keys`, {
      cache: "no-store",
      headers: { "x-admin-token": adminToken },
    });

    if (!res.ok) throw new Error(`Status ${res.status}`);

    const data = await res.json();
    return {
      keys: (data.keys ?? []) as ApiKey[],
      source: "live",
      serverUrl,
      adminToken,
    };
  } catch {
    return { keys: SAMPLE_API_KEYS, source: "sample", serverUrl, adminToken };
  }
}
