import { describe, expect, it, vi } from "vitest";
import StellarSdk from "@stellar/stellar-sdk";

import type { Config } from "../config";

vi.mock("../signing/native", () => ({
  nativeSigner: {
    preflightSoroban: vi.fn(),
    signPayload: vi.fn(async () => Buffer.alloc(64)),
    signPayloadFromVault: vi.fn(async () => Buffer.alloc(64)),
  },
}));

describe("feeBumpHandler", () => {
  it("rejects an already fee-bumped transaction", async () => {
    const { feeBumpHandler } = await import("./feeBump");

    const sourceKeypair = StellarSdk.Keypair.random();
    const feePayerKeypair = StellarSdk.Keypair.random();
    const networkPassphrase = StellarSdk.Networks.TESTNET;
    const baseFee = 100;

    const sourceAccount = new StellarSdk.Account(sourceKeypair.publicKey(), "1");
    const innerTransaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: String(baseFee),
      networkPassphrase,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: sourceKeypair.publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: "10",
        }),
      )
      .setTimeout(0)
      .build();
    innerTransaction.sign(sourceKeypair);

    const feeBumpTx = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
      feePayerKeypair.publicKey(),
      200,
      innerTransaction,
      networkPassphrase,
    );
    feeBumpTx.sign(feePayerKeypair);

    const config = {
      allowedOrigins: ["*"],
      alerting: {
        checkIntervalMs: 60_000,
        cooldownMs: 60_000,
      },
      baseFee,
      crossChainSettlementTimeoutMinutes: 10,
      feeMultiplier: 2,
      feePayerAccounts: [
        {
          publicKey: feePayerKeypair.publicKey(),
          keypair: feePayerKeypair,
          secretSource: {
            type: "env" as const,
            secret: feePayerKeypair.secret(),
          },
        },
      ],
      horizonSelectionStrategy: "priority" as const,
      horizonUrl: undefined,
      horizonUrls: [],
      ipAllowlist: [],
      ipDenylist: [],
      maxOperations: 100,
      maxXdrSize: 10_240,
      networkPassphrase,
      rateLimitMax: 5,
      rateLimitWindowMs: 60_000,
      signerPool: {
        getSnapshot: () => [{ publicKey: feePayerKeypair.publicKey() }],
      },
      stellarRpcUrl: undefined,
      supportedAssets: [],
      vault: undefined,
    } as Config;

    const req = {
      body: {
        submit: false,
        xdr: feeBumpTx.toXDR(),
      },
    } as any;

    const res = {
      locals: {
        apiKey: {
          apiKey: "test-key",
          dailyQuotaStroops: 1_000_000,
          perMinuteLimit: 10,
          tenantId: "tenant-1",
          tier: "pro",
        },
      },
    } as any;

    let nextErr: any;
    const next = (err: any) => {
      nextErr = err;
    };

    await feeBumpHandler(req, res, next as any, config);

    expect(nextErr).toBeTruthy();
    expect(nextErr.statusCode).toBe(400);
    expect(nextErr.message).toBe(
      "Cannot fee-bump an already fee-bumped transaction",
    );
  });
});
