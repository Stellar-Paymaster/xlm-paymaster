import { describe, expect, it, vi } from "vitest";
import { checkKycStatus } from "./kycService";

const tenant = {
  apiKey: "test-key",
  dailyQuotaStroops: 1000,
  id: "tenant-1",
  name: "Test Tenant",
  priceMonthly: 0,
  rateLimit: 5,
  region: "US",
  tier: "free",
  tierName: "Free",
  txLimit: 10,
} as any;

describe("checkKycStatus", () => {
  it("allows sponsorship when the hook is disabled", async () => {
    const decision = await checkKycStatus(
      {
        enabled: false,
        failClosed: true,
        timeoutMs: 2_000,
      },
      { chainId: "stellar", tenant },
      vi.fn() as any,
    );

    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe("approved");
  });

  it("passes tenant and transaction context to the provider", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        providerReference: "kyc-123",
        status: "approved",
      }),
      ok: true,
    });

    const decision = await checkKycStatus(
      {
        apiKey: "secret",
        enabled: true,
        endpointUrl: "https://kyc.example/check",
        failClosed: true,
        timeoutMs: 2_000,
      },
      {
        chainId: "stellar",
        requestId: "req-1",
        tenant,
        transactionHash: "abc123",
      },
      fetchImpl as any,
    );

    expect(decision.allowed).toBe(true);
    expect(decision.providerReference).toBe("kyc-123");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://kyc.example/check",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret",
        }),
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(
      expect.objectContaining({
        requestId: "req-1",
        tenantId: "tenant-1",
        transactionHash: "abc123",
      }),
    );
  });

  it("denies sponsorship on provider review responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ status: "review" }),
      ok: true,
    });

    const decision = await checkKycStatus(
      {
        enabled: true,
        endpointUrl: "https://kyc.example/check",
        failClosed: true,
        timeoutMs: 2_000,
      },
      { chainId: "stellar", tenant },
      fetchImpl as any,
    );

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe("review");
  });

  it("can fail open when the provider is unavailable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    const decision = await checkKycStatus(
      {
        enabled: true,
        endpointUrl: "https://kyc.example/check",
        failClosed: false,
        timeoutMs: 2_000,
      },
      { chainId: "stellar", tenant },
      fetchImpl as any,
    );

    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe("unknown");
  });
});
