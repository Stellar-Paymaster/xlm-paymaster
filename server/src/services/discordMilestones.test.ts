import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DiscordMilestoneNotifier,
  type DiscordMilestoneRecord,
  loadDiscordMilestoneOptionsFromEnv,
  TransactionMilestoneService,
} from "./discordMilestones";

class InMemoryMilestoneRepository {
  private readonly records = new Map<number, DiscordMilestoneRecord>();

  async ensureTable(): Promise<void> {}

  async getByThreshold(threshold: number): Promise<DiscordMilestoneRecord | null> {
    return this.records.get(threshold) ?? null;
  }

  async saveAttempt(
    payload: {
      status: "pending" | "sent";
      threshold: number;
      timestamp: Date;
      totalFeeStroops: number;
      totalTransactions: number;
      uptimeMs: number;
    },
  ): Promise<void> {
    const previous = this.records.get(payload.threshold);

    this.records.set(payload.threshold, {
      attemptCount: (previous?.attemptCount ?? 0) + 1,
      firedAt: payload.status === "sent" ? payload.timestamp : previous?.firedAt ?? null,
      lastAttemptAt: payload.timestamp,
      status: payload.status,
      threshold: payload.threshold,
      totalFeeStroops: payload.totalFeeStroops,
      totalTransactions: payload.totalTransactions,
    });
  }
}

describe("loadDiscordMilestoneOptionsFromEnv", () => {
  it("parses, deduplicates, and sorts milestone thresholds", () => {
    const options = loadDiscordMilestoneOptionsFromEnv({
      DISCORD_MILESTONE_THRESHOLDS: "10000, 1000, nope, 1000, -5, 100000",
      DISCORD_WEBHOOK_URL: "https://discord.test/webhook",
    });

    expect(options.thresholds).toEqual([1000, 10000, 100000]);
    expect(options.webhookUrl).toBe("https://discord.test/webhook");
  });
});

describe("DiscordMilestoneNotifier", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("ok"),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it("posts a Discord embed with total txs, total XLM, and uptime", async () => {
    const notifier = new DiscordMilestoneNotifier({
      serviceName: "Paymaster node",
      thresholds: [1000],
      webhookUrl: "https://discord.test/webhook",
    });

    const sent = await notifier.notifyMilestone({
      threshold: 1000,
      timestamp: new Date("2026-03-27T16:00:00.000Z"),
      totalFeeStroops: 123_456_789,
      totalTransactions: 1000,
      uptimeMs: 3_661_000,
    });

    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(request?.body));
    const embed = body.embeds[0];

    expect(embed.title).toContain("1,000 sponsored txs");
    expect(JSON.stringify(embed.fields)).toContain("12.3456789 XLM");
    expect(JSON.stringify(embed.fields)).toContain("1h 1m 1s");
  });
});

describe("TransactionMilestoneService", () => {
  it("fires newly reached milestones once and records them as sent", async () => {
    const repository = new InMemoryMilestoneRepository();
    const notifier = {
      isConfigured: () => true,
      notifyMilestone: vi.fn().mockResolvedValue(true),
    };
    const service = new TransactionMilestoneService(
      {
        serviceName: "Paymaster node",
        thresholds: [1000, 10000],
        webhookUrl: "https://discord.test/webhook",
      },
      notifier,
      repository,
      async () => ({
        totalFeeStroops: 250_000_000,
        totalTransactions: 1000,
      }),
      () => 90_000,
    );

    const first = await service.checkForMilestones(
      new Date("2026-03-27T16:05:00.000Z"),
    );
    const second = await service.checkForMilestones(
      new Date("2026-03-27T16:06:00.000Z"),
    );

    expect(first).toEqual([1000]);
    expect(second).toEqual([]);
    expect(notifier.notifyMilestone).toHaveBeenCalledTimes(1);

    const stored = await repository.getByThreshold(1000);
    expect(stored?.status).toBe("sent");
    expect(stored?.attemptCount).toBe(1);
  });

  it("keeps milestones pending when Discord delivery fails and retries later", async () => {
    const repository = new InMemoryMilestoneRepository();
    const notifier = {
      isConfigured: () => true,
      notifyMilestone: vi
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    };
    const service = new TransactionMilestoneService(
      {
        serviceName: "Paymaster node",
        thresholds: [1000],
        webhookUrl: "https://discord.test/webhook",
      },
      notifier,
      repository,
      async () => ({
        totalFeeStroops: 50_000_000,
        totalTransactions: 1000,
      }),
      () => 10_000,
    );

    const first = await service.checkForMilestones(
      new Date("2026-03-27T16:10:00.000Z"),
    );
    const second = await service.checkForMilestones(
      new Date("2026-03-27T16:11:00.000Z"),
    );

    expect(first).toEqual([]);
    expect(second).toEqual([1000]);
    expect(notifier.notifyMilestone).toHaveBeenCalledTimes(2);

    const stored = await repository.getByThreshold(1000);
    expect(stored?.status).toBe("sent");
    expect(stored?.attemptCount).toBe(2);
  });
});
