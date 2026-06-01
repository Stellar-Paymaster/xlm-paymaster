import { describe, expect, it, vi } from "vitest";

vi.mock("../signing/native", () => ({
  nativeSigner: {
    preflightSoroban: vi.fn(),
    signPayload: vi.fn(async () => Buffer.alloc(64)),
    signPayloadFromVault: vi.fn(async () => Buffer.alloc(64)),
  },
}));

import StellarSdk from "@stellar/stellar-sdk";
import { Config } from "../config";
import { analyzeSettlementTransaction } from "./settlementTransactionAnalyzer";

describe("settlementTransactionAnalyzer", () => {
  const feePayerKeypair = StellarSdk.Keypair.random();
  const sourceKeypair = StellarSdk.Keypair.random();
  const issuerKeypair = StellarSdk.Keypair.random();
  const marketMakerKeypair = StellarSdk.Keypair.random();
  const usdc = new StellarSdk.Asset("USDC", issuerKeypair.publicKey());
  const settlementToken = `USDC:${issuerKeypair.publicKey()}`;

  const mockConfig: Config = {
    feePayerAccounts: [
      {
        publicKey: feePayerKeypair.publicKey(),
        keypair: feePayerKeypair,
        secretSource: { type: "env", secret: "placeholder-test-secret" },
      },
    ],
    signerPool: {
      getSnapshot: () => [{
        publicKey: feePayerKeypair.publicKey(),
        active: true,
        balance: null,
        inFlight: 0,
        totalUses: 0,
        sequenceNumber: null,
        status: "active",
      }],
    } as any,
    baseFee: 100,
    feeMultiplier: 2.0,
    networkPassphrase: "Test SDF Network ; September 2015",
    horizonUrls: [],
    horizonSelectionStrategy: "priority",
    maxXdrSize: 10240,
    maxOperations: 100,
    rateLimitWindowMs: 60000,
    rateLimitMax: 5,
    allowedOrigins: [],
    alerting: {
      checkIntervalMs: 3600000,
      cooldownMs: 21600000,
    },
  };

  function buildTx(operations: any[]) {
    const account = new StellarSdk.Account(sourceKeypair.publicKey(), "1");
    const builder = new StellarSdk.TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: mockConfig.networkPassphrase,
    });

    for (const operation of operations) {
      builder.addOperation(operation);
    }

    return builder.setTimeout(30).build();
  }

  it("allows a plain strict-receive settlement with no surrounding trade activity", () => {
    const tx = buildTx([
      StellarSdk.Operation.pathPaymentStrictReceive({
        sendAsset: StellarSdk.Asset.native(),
        sendMax: "1",
        destination: feePayerKeypair.publicKey(),
        destAsset: usdc,
        destAmount: "0.00002",
      }),
    ]);

    const result = analyzeSettlementTransaction(
      tx,
      { token: settlementToken, requiredAmountStroops: 200 },
      mockConfig,
    );

    expect(result.isAllowed).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("blocks a settlement that is sandwiched by matching trade activity", () => {
    const tx = buildTx([
      StellarSdk.Operation.manageSellOffer({
        selling: usdc,
        buying: StellarSdk.Asset.native(),
        amount: "5",
        price: "1",
        offerId: "0",
      }),
      StellarSdk.Operation.pathPaymentStrictReceive({
        sendAsset: StellarSdk.Asset.native(),
        sendMax: "1",
        destination: feePayerKeypair.publicKey(),
        destAsset: usdc,
        destAmount: "0.00002",
      }),
      StellarSdk.Operation.manageBuyOffer({
        selling: StellarSdk.Asset.native(),
        buying: usdc,
        buyAmount: "5",
        price: "1",
        offerId: "0",
      }),
    ]);

    const result = analyzeSettlementTransaction(
      tx,
      { token: settlementToken, requiredAmountStroops: 200 },
      mockConfig,
    );

    expect(result.isAllowed).toBe(false);
    expect(result.findings.join(" ")).toContain(
      "Suspicious trade activity appears immediately before and after the fee settlement",
    );
  });

  it("warns but does not block a one-sided pre-settlement trade", () => {
    const tx = buildTx([
      StellarSdk.Operation.manageSellOffer({
        selling: usdc,
        buying: StellarSdk.Asset.native(),
        amount: "5",
        price: "1",
        offerId: "0",
      }),
      StellarSdk.Operation.pathPaymentStrictReceive({
        sendAsset: StellarSdk.Asset.native(),
        sendMax: "1",
        destination: feePayerKeypair.publicKey(),
        destAsset: usdc,
        destAmount: "0.00002",
      }),
      StellarSdk.Operation.payment({
        destination: marketMakerKeypair.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: "1",
      }),
    ]);

    const result = analyzeSettlementTransaction(
      tx,
      { token: settlementToken, requiredAmountStroops: 200 },
      mockConfig,
    );

    expect(result.isAllowed).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });
});
