import { describe, it, expect, vi, beforeEach } from "vitest";
import { DigestWorker, initializeDigestWorker, type CronScheduler } from "./digestWorker";
import type { DigestService } from "../services/digestService";
import type { DigestEmailTransport } from "../services/digestService";

// ── Mock resolveDigestEmailTransport ─────────────────────────────────────────
vi.mock("../services/digestService", () => ({
  DigestService: vi.fn(),
  resolveDigestEmailTransport: vi.fn(() => ({
    kind: "resend",
    apiKey: "test-key",
    apiUrl: "https://api.resend.com/emails",
    from: "noreply@example.com",
    to: ["ops@example.com"],
  })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const fakeTransport: DigestEmailTransport = {
  kind: "resend",
  apiKey: "key",
  apiUrl: "https://api.resend.com/emails",
  from: "noreply@example.com",
  to: ["ops@example.com"],
};

function makeDigestServiceMock(): DigestService {
  return {
    sendDigest: vi.fn().mockResolvedValue(undefined),
    isUnsubscribed: vi.fn().mockResolvedValue(false),
    unsubscribe: vi.fn().mockResolvedValue(true),
    buildUnsubscribeToken: vi.fn().mockReturnValue("mock-token"),
    verifyUnsubscribeToken: vi.fn().mockReturnValue(true),
  } as unknown as DigestService;
}

function makeSchedulerMock(valid = true) {
  const mockStop = vi.fn();
  const schedule = vi.fn(() => ({ stop: mockStop }));
  const validate = vi.fn(() => valid);
  const scheduler: CronScheduler = { schedule, validate };
  return { scheduler, schedule, validate, mockStop };
}

// ── DigestWorker tests ────────────────────────────────────────────────────────

describe("DigestWorker", () => {
  let mockService: DigestService;

  beforeEach(() => {
    mockService = makeDigestServiceMock();
  });

  it("calls sendDigest when runNow() is called", async () => {
    const { scheduler } = makeSchedulerMock();
    const worker = new DigestWorker(fakeTransport, { digestService: mockService, scheduler });
    await worker.runNow();

    expect(mockService.sendDigest).toHaveBeenCalledOnce();
  });

  it("passes alertsTriggered to sendDigest", async () => {
    const { scheduler } = makeSchedulerMock();
    const worker = new DigestWorker(fakeTransport, { digestService: mockService, scheduler });
    const alerts = ["Low balance alert"];
    await worker.runNow(alerts);

    expect(mockService.sendDigest).toHaveBeenCalledWith(expect.any(Date), alerts);
  });

  it("does not schedule cron when enabled=false", () => {
    const { scheduler, schedule } = makeSchedulerMock();
    const worker = new DigestWorker(fakeTransport, {
      digestService: mockService,
      scheduler,
      enabled: false,
    });
    worker.start();

    expect(schedule).not.toHaveBeenCalled();
  });

  it("schedules cron with the correct expression when enabled=true and valid schedule", () => {
    const { scheduler, schedule } = makeSchedulerMock(true);
    const worker = new DigestWorker(fakeTransport, {
      digestService: mockService,
      scheduler,
      cronSchedule: "0 8 * * *",
      enabled: true,
    });
    worker.start();

    expect(schedule).toHaveBeenCalledWith("0 8 * * *", expect.any(Function));
  });

  it("does not schedule when cron expression is invalid", () => {
    const { scheduler, schedule } = makeSchedulerMock(false);
    const worker = new DigestWorker(fakeTransport, {
      digestService: mockService,
      scheduler,
      cronSchedule: "not-a-cron",
      enabled: true,
    });
    worker.start();

    expect(schedule).not.toHaveBeenCalled();
  });

  it("stop() is a no-op when worker not started", () => {
    const { scheduler } = makeSchedulerMock();
    const worker = new DigestWorker(fakeTransport, { digestService: mockService, scheduler });
    expect(() => worker.stop()).not.toThrow();
  });

  it("stop() calls task.stop() after start()", () => {
    const { scheduler, mockStop } = makeSchedulerMock(true);
    const worker = new DigestWorker(fakeTransport, {
      digestService: mockService,
      scheduler,
      cronSchedule: "0 8 * * *",
      enabled: true,
    });
    worker.start();
    worker.stop();

    expect(mockStop).toHaveBeenCalledOnce();
  });

  it("runNow() propagates errors from sendDigest", async () => {
    const { scheduler } = makeSchedulerMock();
    const error = new Error("Email server down");
    (mockService.sendDigest as ReturnType<typeof vi.fn>).mockRejectedValue(error);

    const worker = new DigestWorker(fakeTransport, { digestService: mockService, scheduler });

    await expect(worker.runNow()).rejects.toThrow("Email server down");
  });
});

// ── initializeDigestWorker tests ──────────────────────────────────────────────

describe("initializeDigestWorker", () => {
  it("returns null when no email transport is configured", async () => {
    const mod = await import("../services/digestService");
    vi.mocked(mod.resolveDigestEmailTransport).mockReturnValue(undefined);

    const { initializeDigestWorker: init } = await import("./digestWorker");
    const result = init();
    expect(result).toBeNull();
  });

  it("returns a DigestWorker when transport is available", async () => {
    const mod = await import("../services/digestService");
    vi.mocked(mod.resolveDigestEmailTransport).mockReturnValue(fakeTransport);

    const { initializeDigestWorker: init } = await import("./digestWorker");
    const result = init();
    expect(result).toBeInstanceOf(DigestWorker);

    result?.stop();
  });
});
