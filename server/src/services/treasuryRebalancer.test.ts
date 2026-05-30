import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  loadWormholeConfig: vi.fn(),
}));

vi.mock("./wormholeBridgeService", () => ({
  WormholeBridgeService: vi.fn(),
  loadWormholeConfig: mocks.loadWormholeConfig,
}));

vi.mock("./notificationService", () => ({
  createNotification: mocks.createNotification,
}));

import { TreasuryRebalancer } from "./treasuryRebalancer";

describe("TreasuryRebalancer alerting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadWormholeConfig.mockReturnValue(null);
  });

  it("sends a critical alert when a low hot wallet cannot be topped up", async () => {
    const alertService = {
      sendTreasuryRebalanceFailureAlert: vi.fn().mockResolvedValue(true),
    };
    const rebalancer = new TreasuryRebalancer({} as any, alertService as any);

    await rebalancer.checkAndRebalance("GHOTWALLET", 2);

    expect(alertService.sendTreasuryRebalanceFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        accountPublicKey: "GHOTWALLET",
        balanceXlm: 2,
        thresholdXlm: 50,
      }),
    );
  });

  it("does not alert when the hot wallet is above the rebalance threshold", async () => {
    const alertService = {
      sendTreasuryRebalanceFailureAlert: vi.fn().mockResolvedValue(true),
    };
    const rebalancer = new TreasuryRebalancer({} as any, alertService as any);

    await rebalancer.checkAndRebalance("GHOTWALLET", 100);

    expect(alertService.sendTreasuryRebalanceFailureAlert).not.toHaveBeenCalled();
  });
});
