import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/sandboxCleanup", () => ({
  purgeStaleSandboxTransactionData: vi.fn(),
}));

vi.mock("../handlers/sandbox", () => ({
  autoResetStaleSandboxKeys: vi.fn(),
}));

vi.mock("../utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  serializeError: (error: unknown) => ({ message: String(error) }),
}));

import { autoResetStaleSandboxKeys } from "../handlers/sandbox";
import { purgeStaleSandboxTransactionData } from "../services/sandboxCleanup";
import { SandboxCleanupWorker } from "./sandboxCleanupWorker";

describe("SandboxCleanupWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs purge and reset when runNow is called", async () => {
    (purgeStaleSandboxTransactionData as any).mockResolvedValue({
      status: "SUCCESS",
      transactionsDeleted: 10,
    });
    (autoResetStaleSandboxKeys as any).mockResolvedValue(2);

    const worker = new SandboxCleanupWorker({
      purgeFn: purgeStaleSandboxTransactionData as any,
      resetFn: autoResetStaleSandboxKeys as any,
      scheduler: {
        schedule: vi.fn(),
        validate: vi.fn().mockReturnValue(true),
      },
    });

    const result = await worker.runNow();

    expect(result.purgeReport.transactionsDeleted).toBe(10);
    expect(result.keysReset).toBe(2);
    expect(purgeStaleSandboxTransactionData).toHaveBeenCalledOnce();
    expect(autoResetStaleSandboxKeys).toHaveBeenCalledOnce();
  });

  it("registers a cron task when the schedule is valid", () => {
    const stop = vi.fn();
    const schedule = vi.fn().mockReturnValue({ stop });
    const validate = vi.fn().mockReturnValue(true);

    const worker = new SandboxCleanupWorker({
      scheduler: { schedule, validate },
      purgeFn: purgeStaleSandboxTransactionData as any,
      resetFn: autoResetStaleSandboxKeys as any,
    });

    worker.start();

    expect(validate).toHaveBeenCalledWith("0 4 * * *");
    expect(schedule).toHaveBeenCalledOnce();
    worker.stop();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("does not schedule when disabled", () => {
    const schedule = vi.fn();
    const worker = new SandboxCleanupWorker({
      enabled: false,
      scheduler: { schedule, validate: vi.fn().mockReturnValue(true) },
    });

    worker.start();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("does not schedule when cron expression is invalid", () => {
    const schedule = vi.fn();
    const worker = new SandboxCleanupWorker({
      scheduler: { schedule, validate: vi.fn().mockReturnValue(false) },
    });

    worker.start();
    expect(schedule).not.toHaveBeenCalled();
  });
});
