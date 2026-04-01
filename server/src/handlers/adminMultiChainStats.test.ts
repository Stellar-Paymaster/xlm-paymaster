import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/auditLogger", () => ({
  getAuditActor: vi.fn().mockReturnValue({ type: "admin_token" }),
  logAuditEvent: vi.fn(),
}));

vi.mock("../services/treasuryService", () => ({
  getTreasuryOverview: vi.fn(),
}));

import { getTreasuryOverview } from "../services/treasuryService";
import { getMultiChainStatsHandler } from "./adminMultiChainStats";

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
}

describe("getMultiChainStatsHandler", () => {
  beforeEach(() => {
    process.env.FLUID_ADMIN_TOKEN = "test-admin-token";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.FLUID_ADMIN_TOKEN;
  });

  it("returns treasury overview payload for authorized requests", async () => {
    vi.mocked(getTreasuryOverview).mockResolvedValue({
      chains: [],
      totalUsdValue: 100,
      priceUpdatedAt: "2026-03-29T00:00:00.000Z",
      generatedAt: "2026-03-29T00:00:00.000Z",
    });

    const req = {
      header: (name: string) =>
        name.toLowerCase() === "x-admin-token" ? "test-admin-token" : undefined,
      path: "/admin/multi-chain/stats",
      method: "GET",
    } as any;
    const res = makeRes();

    await getMultiChainStatsHandler({} as any)(req, res);

    expect(getTreasuryOverview).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      chains: [],
      totalUsdValue: 100,
      priceUpdatedAt: "2026-03-29T00:00:00.000Z",
      generatedAt: "2026-03-29T00:00:00.000Z",
    });
  });

  it("rejects requests without an admin token", async () => {
    const req = {
      header: () => undefined,
      path: "/admin/multi-chain/stats",
      method: "GET",
    } as any;
    const res = makeRes();

    await getMultiChainStatsHandler({} as any)(req, res);

    expect(getTreasuryOverview).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });
});
