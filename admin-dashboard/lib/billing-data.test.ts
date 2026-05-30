import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("getBillingPageData", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("should return sample data when environment variables are missing", async () => {
    delete process.env.FLUID_SERVER_URL;
    delete process.env.FLUID_ADMIN_TOKEN;

    const { getBillingPageData } = await import("./billing-data");
    const data = await getBillingPageData();

    expect(data.source).toBe("sample");
    expect(data.currentBalanceXlm).toBe(12450.50);
    expect(data.history).toHaveLength(3);
  });

  it("should fetch live data when environment variables are set", async () => {
    process.env.FLUID_SERVER_URL = "http://test-server";
    process.env.FLUID_ADMIN_TOKEN = "test-token";

    const mockPayload = {
      currentBalanceXlm: 5000,
      quotaUsedXlm: 1000,
      quotaTotalXlm: 6000,
      history: [],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockPayload),
    });

    const { getBillingPageData } = await import("./billing-data");
    const data = await getBillingPageData();

    expect(data.source).toBe("live");
    expect(data.currentBalanceXlm).toBe(5000);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://test-server/admin/billing/dashboard",
      expect.objectContaining({
        headers: { "x-admin-token": "test-token" },
      }),
    );
  });

  it("should fallback to sample data when fetch fails", async () => {
    process.env.FLUID_SERVER_URL = "http://test-server";
    process.env.FLUID_ADMIN_TOKEN = "test-token";

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { getBillingPageData } = await import("./billing-data");
    const data = await getBillingPageData();

    expect(data.source).toBe("sample");
    expect(data.currentBalanceXlm).toBe(12450.50);
  });
});
