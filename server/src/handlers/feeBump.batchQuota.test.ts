import { describe, it, expect, beforeEach, vi } from "vitest";
import StellarSdk from "@stellar/stellar-sdk";
import { feeBumpBatchHandler } from "./feeBump";

const mockEnforceKyc = vi.fn().mockResolvedValue(undefined);
const mockCheckTenantDailyQuota = vi.fn().mockResolvedValue({
  allowed: true,
  currentSpendStroops: 0,
  projectedSpendStroops: 200,
  dailyQuotaStroops: 1_000_000,
  currentTxCount: 0,
  projectedTxCount: 2,
  txLimit: 10,
});
const mockBuildSponsoredTx = vi.fn().mockResolvedValue({
  tx: "fake-fee-bump-xdr",
  status: "ready",
  feePayer: "GFAKEKEY1234567890",
});

vi.mock("../services/kycService", () => ({
  enforceKycForFeeSponsorship: mockEnforceKyc,
}));
vi.mock("../services/quota", () => ({
  checkTenantDailyQuota: mockCheckTenantDailyQuota,
}));
vi.mock("../sponsors/stellar", () => ({
  StellarFeeSponsor: vi.fn().mockImplementation(() => ({
    buildSponsoredTx: mockBuildSponsoredTx,
  })),
}));

function buildSignedXdr(networkPassphrase: string): string {
  const source = StellarSdk.Keypair.random();
  const tx = new StellarSdk.TransactionBuilder(
    new StellarSdk.Account(source.publicKey(), "1"),
    {
      fee: 100,
      networkPassphrase,
    },
  )
    .addOperation(
      StellarSdk.Operation.payment({
        destination: StellarSdk.Keypair.random().publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: "1.0",
      }),
    )
    .setTimeout(30)
    .build();

  tx.sign(source);
  return tx.toXDR();
}

describe("feeBumpBatchHandler quota enforcement", () => {
  beforeEach(() => {
    mockEnforceKyc.mockClear();
    mockCheckTenantDailyQuota.mockClear();
    mockBuildSponsoredTx.mockClear();
  });

  it("checks batch quota using the total number of transactions", async () => {
    const xdr1 = buildSignedXdr(StellarSdk.Networks.TESTNET);
    const xdr2 = buildSignedXdr(StellarSdk.Networks.TESTNET);

    const req = {
      body: {
        xdrs: [xdr1, xdr2],
        submit: false,
      },
      headers: {},
      method: "POST",
      url: "/fee-bump/batch",
      header: () => undefined,
    } as any;

    const res = {
      locals: {
        apiKey: {
          key: "test-key",
          tenantId: "test-tenant",
          name: "Test Tenant",
          region: "US",
          tier: "free",
          tierName: "Free",
          txLimit: 10,
          rateLimit: 5,
          priceMonthly: 0,
          dailyQuotaStroops: 1_000_000,
        },
      },
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any;

    const next = vi.fn();
    const config = {
      networkPassphrase: StellarSdk.Networks.TESTNET,
      baseFee: 100,
      feeMultiplier: 1.0,
      supportedAssets: [],
    } as any;

    await feeBumpBatchHandler(req, res, next, config);

    expect(mockCheckTenantDailyQuota).toHaveBeenCalledWith(
      expect.objectContaining({ id: "test-tenant" }),
      expect.any(Number),
      2,
    );
    expect(mockBuildSponsoredTx).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ tx: "fake-fee-bump-xdr", status: "ready" }),
      expect.objectContaining({ tx: "fake-fee-bump-xdr", status: "ready" }),
    ]);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a batch when the total transaction count exceeds quota", async () => {
    mockCheckTenantDailyQuota.mockResolvedValueOnce({
      allowed: false,
      currentSpendStroops: 900_000,
      projectedSpendStroops: 900_000,
      dailyQuotaStroops: 900_000,
      currentTxCount: 9,
      projectedTxCount: 11,
      txLimit: 10,
    });

    const xdr1 = buildSignedXdr(StellarSdk.Networks.TESTNET);
    const xdr2 = buildSignedXdr(StellarSdk.Networks.TESTNET);

    const req = {
      body: { xdrs: [xdr1, xdr2], submit: false },
      headers: {},
      method: "POST",
      url: "/fee-bump/batch",
      header: () => undefined,
    } as any;

    const res = {
      locals: {
        apiKey: {
          key: "test-key",
          tenantId: "test-tenant",
          name: "Test Tenant",
          region: "US",
          tier: "free",
          tierName: "Free",
          txLimit: 10,
          rateLimit: 5,
          priceMonthly: 0,
          dailyQuotaStroops: 900_000,
        },
      },
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any;

    const next = vi.fn();
    const config = {
      networkPassphrase: StellarSdk.Networks.TESTNET,
      baseFee: 100,
      feeMultiplier: 1.0,
      supportedAssets: [],
    } as any;

    await feeBumpBatchHandler(req, res, next, config);

    expect(mockCheckTenantDailyQuota).toHaveBeenCalledWith(
      expect.objectContaining({ id: "test-tenant" }),
      expect.any(Number),
      2,
    );
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("QUOTA_EXCEEDED");
  });
});
