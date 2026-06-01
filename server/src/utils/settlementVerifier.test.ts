import { describe, it, expect, vi } from "vitest";

vi.mock("../signing/native", () => ({
  nativeSigner: {
    preflightSoroban: vi.fn(),
    signPayload: vi.fn(async () => Buffer.alloc(64)),
    signPayloadFromVault: vi.fn(async () => Buffer.alloc(64)),
  },
}));

import StellarSdk from "@stellar/stellar-sdk";
import { verifySettlementPayment, extractSettlementRequirement } from "./settlementVerifier";
import { Config } from "../config";

describe("settlementVerifier", () => {
  const feePayerKeypair = StellarSdk.Keypair.random();
  const sourceKeypair = StellarSdk.Keypair.random();
  const issuerKeypair = StellarSdk.Keypair.random();
  const wrongDestKeypair = StellarSdk.Keypair.random();
  const btcIssuerKeypair = StellarSdk.Keypair.random();
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

  const NETWORK = "Test SDF Network ; September 2015";

  function buildTx(operations: ReturnType<typeof StellarSdk.Operation.payment>[]) {
    const account = new StellarSdk.Account(sourceKeypair.publicKey(), "1");
    const builder = new StellarSdk.TransactionBuilder(account, { fee: "100", networkPassphrase: NETWORK });
    for (const op of operations) {
      builder.addOperation(op);
    }
    return builder.setTimeout(30).build();
  }

  describe("verifySettlementPayment", () => {
    it("should accept a valid payment operation", () => {
      const tx = buildTx([
        StellarSdk.Operation.payment({
          destination: feePayerKeypair.publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: "0.00002",
        }),
      ]);

      const result = verifySettlementPayment(tx, { token: "XLM", requiredAmountStroops: 200 }, mockConfig);

      expect(result.isValid).toBe(true);
      expect(parseFloat(result.actualAmount!)).toBeCloseTo(0.00002, 7);
      expect(result.assetCode).toBe("XLM");
    });

    it("should accept a valid pathPaymentStrictReceive operation", () => {
      const tx = buildTx([
        StellarSdk.Operation.pathPaymentStrictReceive({
          sendAsset: StellarSdk.Asset.native(),
          sendMax: "1",
          destination: feePayerKeypair.publicKey(),
          destAsset: new StellarSdk.Asset("USDC", issuerKeypair.publicKey()),
          destAmount: "0.00002",
        }),
      ]);

      const result = verifySettlementPayment(tx, { token: settlementToken, requiredAmountStroops: 200 }, mockConfig);

      expect(result.isValid).toBe(true);
      expect(parseFloat(result.actualAmount!)).toBeCloseTo(0.00002, 7);
      expect(result.assetCode).toBe(settlementToken);
    });

    it("should reject insufficient payment amount", () => {
      const tx = buildTx([
        StellarSdk.Operation.payment({
          destination: feePayerKeypair.publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: "0.00001",
        }),
      ]);

      const result = verifySettlementPayment(tx, { token: "XLM", requiredAmountStroops: 200 }, mockConfig);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe("Incorrect settlement amount");
      expect(parseFloat(result.expectedAmount!)).toBeCloseTo(0.00002, 7);
      expect(parseFloat(result.actualAmount!)).toBeCloseTo(0.00001, 7);
    });

    it("should reject overpayment because settlement amount must be exact", () => {
      const tx = buildTx([
        StellarSdk.Operation.payment({
          destination: feePayerKeypair.publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: "0.00003",
        }),
      ]);

      const result = verifySettlementPayment(tx, { token: "XLM", requiredAmountStroops: 200 }, mockConfig);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe("Incorrect settlement amount");
    });

    it("should reject payment to wrong destination", () => {
      const tx = buildTx([
        StellarSdk.Operation.payment({
          destination: wrongDestKeypair.publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: "0.00002",
        }),
      ]);

      const result = verifySettlementPayment(tx, { token: "XLM", requiredAmountStroops: 200 }, mockConfig);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("No settlement payment found");
    });

    it("should reject payment with wrong asset", () => {
      const tx = buildTx([
        StellarSdk.Operation.payment({
          destination: feePayerKeypair.publicKey(),
          asset: new StellarSdk.Asset("BTC", btcIssuerKeypair.publicKey()),
          amount: "0.00002",
        }),
      ]);

      const result = verifySettlementPayment(tx, { token: settlementToken, requiredAmountStroops: 200 }, mockConfig);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("No settlement payment found");
    });

    it("should reject pathPaymentStrictSend settlements", () => {
      const tx = buildTx([
        StellarSdk.Operation.pathPaymentStrictSend({
          sendAsset: StellarSdk.Asset.native(),
          sendAmount: "1",
          destination: feePayerKeypair.publicKey(),
          destAsset: new StellarSdk.Asset("USDC", issuerKeypair.publicKey()),
          destMin: "0.00002",
        }),
      ]);

      const result = verifySettlementPayment(tx, { token: settlementToken, requiredAmountStroops: 200 }, mockConfig);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("pathPaymentStrictReceive");
    });

    it("should reject when no settlement operations are found", () => {
      const tx = buildTx([
        StellarSdk.Operation.createAccount({
          destination: wrongDestKeypair.publicKey(),
          startingBalance: "1",
        }),
      ]);

      const result = verifySettlementPayment(tx, { token: "XLM", requiredAmountStroops: 200 }, mockConfig);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("No settlement payment found");
    });

    it("should reject multiple settlement operations", () => {
      const tx = buildTx([
        StellarSdk.Operation.payment({
          destination: feePayerKeypair.publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: "0.00002",
        }),
        StellarSdk.Operation.payment({
          destination: feePayerKeypair.publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: "0.00002",
        }),
      ]);

      const result = verifySettlementPayment(tx, { token: "XLM", requiredAmountStroops: 200 }, mockConfig);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("Multiple settlement operations");
    });
  });

  describe("extractSettlementRequirement", () => {
    it("should return null when no token is specified", () => {
      const result = extractSettlementRequirement(undefined, 200);
      expect(result).toBeNull();
    });

    it("should return requirement when token is specified", () => {
      const result = extractSettlementRequirement(settlementToken, 200);
      expect(result).toEqual({ token: settlementToken, requiredAmountStroops: 200 });
    });

    it("should use default fee amount when not specified", () => {
      const result = extractSettlementRequirement("XLM");
      expect(result).toEqual({ token: "XLM", requiredAmountStroops: 100 });
    });
  });
});
