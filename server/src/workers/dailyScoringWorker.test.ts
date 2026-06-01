import { describe, it, expect, beforeEach, vi } from "vitest";

// All shared mocks MUST be created with vi.hoisted so they are available
// when vi.mock factory functions execute (which are hoisted before imports).
const mocks = vi.hoisted(() => ({
  updateDailyStats: vi.fn().mockResolvedValue(undefined),
  processAutoAdjustments: vi.fn().mockResolvedValue([
    { tenantId: "tenant-1", fromTier: "Free", toTier: "Pro", reason: "auto_upgrade" },
  ]),
  createNotification: vi.fn().mockResolvedValue({}),
  schedule: vi.fn(),
}));

vi.mock("../services/tenantUsageTracker", () => ({
  TenantUsageTracker: class {
    updateDailyStats = mocks.updateDailyStats;
  },
}));

vi.mock("../services/intelligentRateLimiter", () => ({
  IntelligentRateLimiter: class {
    processAutoAdjustments = mocks.processAutoAdjustments;
  },
}));

vi.mock("../services/notificationService", () => ({
  createNotification: (...args: any[]) => mocks.createNotification(...args),
}));

vi.mock("../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

vi.mock("node-cron", () => ({
  default: {
    schedule: (...args: any[]) => mocks.schedule(...args),
    getTasks: () => new Map(),
  },
  schedule: (...args: any[]) => mocks.schedule(...args),
}));

import { DailyScoringWorker } from "../workers/dailyScoringWorker";

describe("DailyScoringWorker", () => {
  let worker: DailyScoringWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateDailyStats.mockResolvedValue(undefined);
    mocks.processAutoAdjustments.mockResolvedValue([
      { tenantId: "tenant-1", fromTier: "Free", toTier: "Pro", reason: "auto_upgrade" },
    ]);
    mocks.createNotification.mockResolvedValue({});
    worker = new DailyScoringWorker();
  });

  describe("runDailyScoring", () => {
    it("should run daily scoring successfully", async () => {
      await worker.runDailyScoring();

      expect(mocks.updateDailyStats).toHaveBeenCalled();
      expect(mocks.processAutoAdjustments).toHaveBeenCalled();
      expect(mocks.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "info", title: "Daily Rate Limit Adjustments" })
      );
    });

    it("should handle errors gracefully", async () => {
      mocks.updateDailyStats.mockRejectedValueOnce(new Error("Database error"));

      await expect(worker.runDailyScoring()).resolves.toBeUndefined();
    });

    it("should not run if already running", async () => {
      // Simulate an in-progress cycle so runCycle skips
      worker["currentPromise"] = Promise.resolve();

      await worker["runCycle"](async () => {
        await worker.runDailyScoring();
      });

      expect(mocks.updateDailyStats).not.toHaveBeenCalled();
    });

    it("should not create notification when no adjustments", async () => {
      mocks.processAutoAdjustments.mockResolvedValueOnce([]);

      await worker.runDailyScoring();

      expect(mocks.createNotification).not.toHaveBeenCalled();
    });
  });

  describe("getStatus", () => {
    it("should return current status", () => {
      expect(worker.getStatus()).toEqual({ isRunning: false });
    });
  });

  describe("start", () => {
    it("should schedule the daily job", () => {
      worker.start();

      expect(mocks.schedule).toHaveBeenCalledWith(
        "0 2 * * *",
        expect.any(Function),
        { timezone: "UTC" }
      );
    });
  });

  describe("stop", () => {
    it("should stop all scheduled tasks", async () => {
      const mockTask = { stop: vi.fn() };
      mocks.schedule.mockReturnValue(mockTask);

      worker.start();
      await worker.stop();

      expect(mockTask.stop).toHaveBeenCalled();
    });
  });
});
