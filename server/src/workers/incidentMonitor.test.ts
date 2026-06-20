import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../signing/native", () => ({
  nativeSigner: {
    preflightSoroban: vi.fn(),
    signPayload: vi.fn(async () => Buffer.alloc(64)),
    signPayloadFromVault: vi.fn(async () => Buffer.alloc(64)),
  },
}));

const redisStore = new Map<string, string>();
vi.mock("../utils/redis", () => ({
  default: {
    get: vi.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => { redisStore.set(key, value); return Promise.resolve("OK"); }),
    del: vi.fn((key: string) => { redisStore.delete(key); return Promise.resolve(1); }),
  },
}));

import StellarSdk from "@stellar/stellar-sdk";
import { SignerPool } from "../signing/signerPool";
import { IncidentMonitor } from "./incidentMonitor";
import type { Config } from "../config";
import type { PagerDutyEventType } from "../services/pagerDutyNotifier";

describe("IncidentMonitor", () => {
  const trigger = vi.fn().mockResolvedValue(true);
  const resolve = vi.fn().mockResolvedValue(true);

  const notifier = {
    isConfigured: () => true,
    trigger,
    resolve,
  } as any;

  const buildConfig = (): Config => {
    const keypair = StellarSdk.Keypair.random();
    const signerPool = new SignerPool(
      [
        {
          keypair,
          secret: keypair.secret(),
        },
      ],
      { lowBalanceThreshold: 1n },
    );

    return {
      feePayerAccounts: [
        {
          publicKey: keypair.publicKey(),
          keypair,
          secretSource: { type: "env", secret: keypair.secret() },
        },
      ],
      signerPool,
      baseFee: 100,
      feeMultiplier: 2,
      networkPassphrase: "Testnet",
      horizonUrl: "https://horizon.example",
      horizonUrls: ["https://horizon.example"],
      horizonSelectionStrategy: "priority",
      rateLimitWindowMs: 60000,
      rateLimitMax: 5,
      allowedOrigins: [],
      alerting: {
        checkIntervalMs: 60000,
        cooldownMs: 60000,
      },
      supportedAssets: [],
      maxXdrSize: 10240,
      maxOperations: 100,
      stellarRpcUrl: undefined,
    } as any;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-27T12:00:00.000Z"));
    trigger.mockClear();
    resolve.mockClear();
    redisStore.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("triggers signer pool empty incident when no active accounts remain", async () => {
    const config = buildConfig();
    const account = config.signerPool.getSnapshot()[0];
    await config.signerPool.markSequenceError(account.publicKey);

    const monitor = new IncidentMonitor(config, notifier, {
      horizonCheck: async () => true,
    });

    await (monitor as any).checkIncidents();

    expect(trigger).toHaveBeenCalledWith(
      "signer_pool_empty" as PagerDutyEventType,
      expect.objectContaining({
        summary: "No usable signing accounts available",
      }),
    );
  });

  it("fires horizon unreachable after 60 seconds of failures", async () => {
    const config = buildConfig();
    const monitor = new IncidentMonitor(config, notifier, {
      horizonCheck: async () => false,
    });

    await (monitor as any).checkIncidents();
    expect(trigger).not.toHaveBeenCalledWith(
      "horizon_unreachable",
      expect.anything(),
    );

    vi.setSystemTime(new Date("2026-03-27T12:01:10.000Z"));
    await (monitor as any).checkIncidents();

    expect(trigger).toHaveBeenCalledWith(
      "horizon_unreachable" as PagerDutyEventType,
      expect.objectContaining({
        summary: "Horizon unreachable for over 60 seconds",
      }),
    );
  });

  it("resolves restart incident after recovery", async () => {
    const config = buildConfig();
    const monitor = new IncidentMonitor(config, notifier, {
      horizonCheck: async () => true,
    });

    await (monitor as any).triggerIncident("server_restart", {
      summary: "Paymaster server restarted",
    });
    (monitor as any).restartPending = true;

    await (monitor as any).checkIncidents();

    expect(resolve).toHaveBeenCalledWith(
      "server_restart" as PagerDutyEventType,
      expect.objectContaining({
        summary: "Paymaster server recovered after restart",
      }),
    );
  });
});
