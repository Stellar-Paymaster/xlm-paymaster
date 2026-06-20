import "server-only";

import type { FeeMultiplierData } from "@/components/dashboard/types";

const SAMPLE_DATA: FeeMultiplierData = {
  congestionLevel: "low",
  multiplier: 1,
  reason: "Sample mode",
  source: "sample",
  updatedAt: new Date().toISOString(),
};

export async function getFeeMultiplierData(): Promise<FeeMultiplierData> {
  const serverUrl = process.env.PAYMASTER_SERVER_URL?.trim().replace(/\/$/, "") ?? "";
  const adminToken = process.env.PAYMASTER_ADMIN_TOKEN?.trim() ?? "";

  if (!serverUrl || !adminToken) {
    return SAMPLE_DATA;
  }

  try {
    const response = await fetch(`${serverUrl}/admin/fee-multiplier`, {
      cache: "no-store",
      headers: {
        "x-admin-token": adminToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }

    const payload = (await response.json()) as Omit<FeeMultiplierData, "source">;
    return {
      ...payload,
      source: "live",
    };
  } catch {
    return SAMPLE_DATA;
  }
}
