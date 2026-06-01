import { describe, expect, it, vi } from "vitest";

vi.mock("../signing/native", () => ({
  nativeSigner: {
    signPayload: vi.fn(),
    signPayloadFromVault: vi.fn(),
    preflightSoroban: vi.fn(),
  },
}));

vi.mock("../models/transactionLedger", () => ({
  recordSponsoredTransaction: vi.fn(),
  getTenantDailySpendStroops: vi.fn(async () => 0),
}));

vi.mock("../services/quota", () => ({
  checkTenantDailyQuota: vi.fn(() => ({ allowed: true })),
}));

vi.mock("../workers/transactionStore", () => ({
  transactionStore: {
    addTransaction: vi.fn(),
  },
}));

vi.mock("../utils/db", () => ({
  prisma: {
    transaction: {
      create: vi.fn(async () => ({ id: "tx-record-1" })),
      update: vi.fn(),
    },
  },
}));

import StellarSdk from "@stellar/stellar-sdk";
import { feeBumpHandler } from "./feeBump";
import { Config } from "../config";

describe("feeBumpHandler Whitelist", () => {
  it("rejects non-whitelisted assets (e.g. SHIB) with 400 Bad Request", async () => {
    const sourceKeypair = StellarSdk.Keypair.random();
    const feePayerKeypair = StellarSdk.Keypair.random();
    
    const sourceAccount = new StellarSdk.Account(sourceKeypair.publicKey(), "1");
    const innerTransaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: "100",
      networkPassphrase: "Test SDF Network ; September 2015",
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: sourceKeypair.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: "1",
      }))
      .setTimeout(0)
      .build();
    innerTransaction.sign(sourceKeypair);

    const config: Config = {
      feePayerAccounts: [{
        publicKey: feePayerKeypair.publicKey(),
        keypair: feePayerKeypair,
        secretSource: { type: "env", secret: feePayerKeypair.secret() }
      }],
      signerPool: {
        getSnapshot: () => [{ publicKey: feePayerKeypair.publicKey() }]
      } as any,
      baseFee: 100,
      feeMultiplier: 1,
      networkPassphrase: "Test SDF Network ; September 2015",
      allowedOrigins: ["*"],
      rateLimitWindowMs: 60000,
      rateLimitMax: 10,
      alerting: { checkIntervalMs: 60000, cooldownMs: 3600000 },
      supportedAssets: [
        { code: "USDC", issuer: "G..."},
        { code: "EURC", issuer: "E..."}
      ],
      maxXdrSize: 10000,
      maxOperations: 100,
      horizonSelectionStrategy: "priority",
      horizonUrls: []
    };

    const req: any = {
      body: {
        xdr: innerTransaction.toXDR(),
        token: "SHIB" // Using SHIB which is not in the whitelist
      }
    };

    const res: any = {
      locals: {
        apiKey: {
          tenantId: "tenant-1",
          tier: "pro",
          apiKey: "test-key"
        }
      }
    };

    let nextErr: any;
    const next = (err: any) => { nextErr = err; };

    console.log("--- START REJECTION LOG ---");
    await feeBumpHandler(req, res, next as any, config);
    console.log("--- END REJECTION LOG ---");

    expect(nextErr).toBeTruthy();
    expect(nextErr.statusCode).toBe(400);
    expect(nextErr.code).toBe("UNSUPPORTED_ASSET");
    expect(nextErr.message).toContain('Whitelisting failed: Asset "SHIB" is not accepted');
  });

  it("accepts whitelisted assets (e.g. USDC)", async () => {
    const sourceKeypair = StellarSdk.Keypair.random();
    const feePayerKeypair = StellarSdk.Keypair.random();
    
    const sourceAccount = new StellarSdk.Account(sourceKeypair.publicKey(), "1");
    const innerTransaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: "100",
      networkPassphrase: "Test SDF Network ; September 2015",
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: sourceKeypair.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: "1",
      }))
      .setTimeout(0)
      .build();
    innerTransaction.sign(sourceKeypair);

    const config: Config = {
      feePayerAccounts: [{
        publicKey: feePayerKeypair.publicKey(),
        keypair: feePayerKeypair,
        secretSource: { type: "env", secret: feePayerKeypair.secret() }
      }],
      signerPool: {
        getSnapshot: () => [{ publicKey: feePayerKeypair.publicKey() }]
      } as any,
      baseFee: 100,
      feeMultiplier: 1,
      networkPassphrase: "Test SDF Network ; September 2015",
      allowedOrigins: ["*"],
      rateLimitWindowMs: 60000,
      rateLimitMax: 10,
      alerting: { checkIntervalMs: 60000, cooldownMs: 3600000 },
      supportedAssets: [
        { code: "USDC", issuer: "G..."}
      ],
      maxXdrSize: 10000,
      maxOperations: 100,
      horizonSelectionStrategy: "priority",
      horizonUrls: []
    };

    const req: any = {
      body: {
        xdr: innerTransaction.toXDR(),
        token: "USDC:G..."
      }
    };

    const res: any = {
      locals: {
        apiKey: {
          tenantId: "tenant-1",
          tier: "pro",
          apiKey: "test-key"
        }
      },
      json: vi.fn(),
      status: vi.fn().mockReturnThis()
    };

    let nextErr: any;
    const next = (err: any) => { nextErr = err; };

    await feeBumpHandler(req, res, next as any, config);

    expect(nextErr).toBeUndefined();
    expect(res.json).toHaveBeenCalled();
  });
});
