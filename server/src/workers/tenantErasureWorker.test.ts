import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/tenantErasure", () => ({
  purgeExpiredTenantErasures: vi.fn(),
}));

vi.mock("../utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
  serializeError: (error: unknown) => ({ message: String(error) }),
}));

import { purgeExpiredTenantErasures } from "../services/tenantErasure";
import { TenantErasureWorker } from "./tenantErasureWorker";

describe("TenantErasureWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the purge function immediately when requested", async () => {
    (purgeExpiredTenantErasures as any).mockResolvedValue(2);

    const worker = new TenantErasureWorker({
      purgeFn: purgeExpiredTenantErasures as any,
      scheduler: {
        schedule: vi.fn(),
        validate: vi.fn().mockReturnValue(true),
      },
    });

    await expect(worker.runNow()).resolves.toBe(2);
    expect(purgeExpiredTenantErasures).toHaveBeenCalledOnce();
  });

  it("registers a cron task when the schedule is valid", () => {
    const stop = vi.fn();
    const schedule = vi.fn().mockReturnValue({ stop });
    const validate = vi.fn().mockReturnValue(true);

    const worker = new TenantErasureWorker({
      scheduler: { schedule, validate },
      purgeFn: purgeExpiredTenantErasures as any,
    });

    worker.start();

    expect(validate).toHaveBeenCalledWith("0 3 * * *");
    expect(schedule).toHaveBeenCalledOnce();
    worker.stop();
    expect(stop).toHaveBeenCalledOnce();
  });
});
