import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GrpcEngineSignerClient } from "./grpcEngineClient";
import { GrpcEngineConfig } from "../config";
import fs from "fs";

vi.mock("fs", () => ({
  default: {
    readFileSync: vi.fn().mockReturnValue(Buffer.from("-----BEGIN CERTIFICATE-----\nMIICDDCCAXQCCQC\n-----END CERTIFICATE-----\n")),
  },
  readFileSync: vi.fn().mockReturnValue(Buffer.from("-----BEGIN CERTIFICATE-----\nMIICDDCCAXQCCQC\n-----END CERTIFICATE-----\n")),
}));

// Mock the internal getClient logic by mocking the grpc loader
const mockPrimaryClient = {
  health: vi.fn(),
  signPayload: vi.fn(),
  signPayloadFromVault: vi.fn(),
  close: vi.fn(),
};

const mockSecondaryClient = {
  health: vi.fn(),
  signPayload: vi.fn(),
  signPayloadFromVault: vi.fn(),
  close: vi.fn(),
};

vi.mock("@grpc/proto-loader", () => ({
  loadSync: vi.fn().mockReturnValue({}),
}));



describe("GrpcEngineSignerClient - Active-Passive Failover", () => {
  let config: GrpcEngineConfig;
  let client: GrpcEngineSignerClient;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    config = {
      address: "primary-address",
      secondaryAddress: "secondary-address",
      pinnedServerCertSha256: [],
      serverName: "fluid-grpc-engine.internal",
      tlsCaPath: "/ca",
      tlsCertPath: "/cert",
      tlsKeyPath: "/key",
    };

    client = new GrpcEngineSignerClient(config);

    // Mock the internal getClient method to avoid real gRPC / TLS connections
    (client as any).getClient = vi.fn().mockImplementation((isPrimary: boolean) => {
      return isPrimary ? mockPrimaryClient : mockSecondaryClient;
    });
  });

  afterEach(() => {
    client.close();
    vi.useRealTimers();
  });

  it("should use primary client if it is successful", async () => {
    mockPrimaryClient.health.mockImplementation((req, cb) => cb(null, { status: "OK" }));

    const status = await client.health();
    expect(status).toBe("OK");
    expect(mockPrimaryClient.health).toHaveBeenCalledTimes(1);
    expect(mockSecondaryClient.health).not.toHaveBeenCalled();
  });

  it("should failover to secondary client if primary fails", async () => {
    mockPrimaryClient.health.mockImplementation((req, cb) => cb(new Error("Primary down"), null));
    mockSecondaryClient.health.mockImplementation((req, cb) => cb(null, { status: "OK_SECONDARY" }));

    const status = await client.health();
    expect(status).toBe("OK_SECONDARY");
    expect(mockPrimaryClient.health).toHaveBeenCalledTimes(1);
    expect(mockSecondaryClient.health).toHaveBeenCalledTimes(1);
  });

  it("should set a 30-second circuit breaker after primary fails", async () => {
    mockPrimaryClient.health.mockImplementation((req, cb) => cb(new Error("Primary down"), null));
    mockSecondaryClient.health.mockImplementation((req, cb) => cb(null, { status: "OK_SECONDARY" }));

    // First call: tries primary, fails, falls back to secondary
    await client.health();

    expect(mockPrimaryClient.health).toHaveBeenCalledTimes(1);
    expect(mockSecondaryClient.health).toHaveBeenCalledTimes(1);

    mockSecondaryClient.health.mockClear();
    mockPrimaryClient.health.mockClear();

    // Second call immediately after: should skip primary entirely and hit secondary
    await client.health();
    expect(mockPrimaryClient.health).not.toHaveBeenCalled();
    expect(mockSecondaryClient.health).toHaveBeenCalledTimes(1);

    mockSecondaryClient.health.mockClear();

    // Advance time by 31 seconds to heal circuit breaker
    vi.advanceTimersByTime(31000);

    // Primary has healed now, we'll make it succeed this time
    mockPrimaryClient.health.mockImplementation((req, cb) => cb(null, { status: "OK" }));
    
    await client.health();
    expect(mockPrimaryClient.health).toHaveBeenCalledTimes(1);
    expect(mockSecondaryClient.health).not.toHaveBeenCalled();
  });

  it("should throw if both primary and secondary fail", async () => {
    mockPrimaryClient.health.mockImplementation((req, cb) => cb(new Error("Primary down"), null));
    mockSecondaryClient.health.mockImplementation((req, cb) => cb(new Error("Secondary down"), null));

    await expect(client.health()).rejects.toThrow("Secondary down");
    expect(mockPrimaryClient.health).toHaveBeenCalledTimes(1);
    expect(mockSecondaryClient.health).toHaveBeenCalledTimes(1);
  });

  it("should throw primary error if secondary is not configured", async () => {
    config.secondaryAddress = undefined;
    const singleClient = new GrpcEngineSignerClient(config);
    (singleClient as any).getClient = vi.fn().mockImplementation((isPrimary: boolean) => {
      return isPrimary ? mockPrimaryClient : mockSecondaryClient;
    });

    mockPrimaryClient.health.mockImplementation((req, cb) => cb(new Error("Primary down"), null));

    await expect(singleClient.health()).rejects.toThrow("Primary down");
    expect(mockPrimaryClient.health).toHaveBeenCalledTimes(1);
    expect(mockSecondaryClient.health).not.toHaveBeenCalled();
  });
});
