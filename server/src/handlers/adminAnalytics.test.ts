import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../config";

vi.mock("../utils/readDb", () => ({
  default: {
    transaction: {
      findMany: vi.fn(),
    },
  },
}));

import readPrisma from "../utils/readDb";
import { getSpendForecastHandler } from "./adminAnalytics";

function buildConfig(currentBalanceStroops: string): Config {
  return {
    signerPool: {
      getSnapshot: () => [
        {
          balance: currentBalanceStroops,
        },
      ],
    },
  } as Config;
}

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };

  return res as any;
}

describe("getSpendForecastHandler", () => {
  beforeEach(() => {
    process.env.FLUID_ADMIN_TOKEN = "test-admin-token";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.FLUID_ADMIN_TOKEN;
  });

  it("returns runway message and projection payload", async () => {
    (readPrisma as any).transaction.findMany.mockResolvedValue([
      {
        costStroops: BigInt(100_000_000),
        createdAt: new Date("2026-03-28T00:00:00.000Z"),
      },
    ]);

    const req = {
      header: (name: string) =>
        name.toLowerCase() === "x-admin-token" ? "test-admin-token" : undefined,
    } as any;
    const res = makeRes();

    await getSpendForecastHandler(buildConfig("1400000000"))(req, res);

    expect(res.status).not.toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledTimes(1);

    const payload = res.json.mock.calls[0][0];
    expect(payload.runwayMessage).toContain("At current spend rate");
    expect(Array.isArray(payload.projectedBalance)).toBe(true);
    expect(typeof payload.alert).toBe("boolean");
  });

  it("rejects requests without admin token", async () => {
    const req = {
      header: () => undefined,
    } as any;
    const res = makeRes();

    await getSpendForecastHandler(buildConfig("1400000000"))(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });
});
