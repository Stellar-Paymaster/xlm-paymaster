import { createLogger, serializeError } from "../utils/logger";

const logger = createLogger({ component: "discord_milestones" });

const DEFAULT_MILESTONE_THRESHOLDS = [1_000, 10_000, 100_000];

export interface DiscordMilestoneOptions {
  serviceName: string;
  thresholds: number[];
  webhookUrl?: string;
}

export interface DiscordMilestonePayload {
  threshold: number;
  timestamp: Date;
  totalFeeStroops: number;
  totalTransactions: number;
  uptimeMs: number;
}

export interface DiscordMilestoneRecord {
  attemptCount: number;
  firedAt: Date | null;
  lastAttemptAt: Date | null;
  status: "pending" | "sent";
  threshold: number;
  totalFeeStroops: number;
  totalTransactions: number;
}

export interface DiscordMilestoneNotifierLike {
  isConfigured(): boolean;
  notifyMilestone(payload: DiscordMilestonePayload): Promise<boolean>;
}

export interface DiscordMilestoneRepositoryLike {
  ensureTable(): Promise<void>;
  getByThreshold(threshold: number): Promise<DiscordMilestoneRecord | null>;
  saveAttempt(
    payload: DiscordMilestonePayload & {
      status: "pending" | "sent";
    },
  ): Promise<void>;
}

interface DiscordMilestoneRow {
  attemptCount: number;
  firedAt: string | null;
  lastAttemptAt: string | null;
  status: string;
  threshold: number;
  totalFeeStroops: number | string | bigint;
  totalTransactions: number;
}

function parseThresholds(value: string | undefined): number[] {
  if (!value) {
    return DEFAULT_MILESTONE_THRESHOLDS;
  }

  const parsed = value
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0);

  return [...new Set(parsed)].sort((left, right) => left - right);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatXlm(stroops: number): string {
  return `${(stroops / 10_000_000).toFixed(7)} XLM`;
}

function formatUptime(uptimeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(uptimeMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const segments = [];

  if (days > 0) {
    segments.push(`${days}d`);
  }
  if (hours > 0 || days > 0) {
    segments.push(`${hours}h`);
  }
  if (minutes > 0 || hours > 0 || days > 0) {
    segments.push(`${minutes}m`);
  }
  segments.push(`${seconds}s`);

  return segments.join(" ");
}

export function loadDiscordMilestoneOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DiscordMilestoneOptions {
  return {
    serviceName: env.DISCORD_MILESTONE_SERVICE_NAME?.trim() || "Paymaster node",
    thresholds: parseThresholds(env.DISCORD_MILESTONE_THRESHOLDS),
    webhookUrl: env.DISCORD_WEBHOOK_URL?.trim() || undefined,
  };
}

export class DiscordMilestoneNotifier
  implements DiscordMilestoneNotifierLike
{
  private readonly serviceName: string;
  private readonly webhookUrl?: string;

  constructor(options: DiscordMilestoneOptions = loadDiscordMilestoneOptionsFromEnv()) {
    this.serviceName = options.serviceName;
    this.webhookUrl = options.webhookUrl;
  }

  isConfigured(): boolean {
    return Boolean(this.webhookUrl);
  }

  async notifyMilestone(payload: DiscordMilestonePayload): Promise<boolean> {
    if (!this.webhookUrl) {
      return false;
    }

    const body = {
      embeds: [
        {
          color: 0x5865f2,
          description:
            "A sponsorship milestone just landed. Celebrate the operator progress with the community.",
          fields: [
            {
              inline: true,
              name: "Total txs sponsored",
              value: formatCount(payload.totalTransactions),
            },
            {
              inline: true,
              name: "Total XLM sponsored",
              value: formatXlm(payload.totalFeeStroops),
            },
            {
              inline: true,
              name: "Uptime",
              value: formatUptime(payload.uptimeMs),
            },
          ],
          footer: {
            text: this.serviceName,
          },
          timestamp: payload.timestamp.toISOString(),
          title: `Milestone reached: ${formatCount(payload.threshold)} sponsored txs`,
        },
      ],
      username: `${this.serviceName} milestones`,
    };

    try {
      const response = await fetch(this.webhookUrl, {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        logger.error(
          {
            response_body: await response.text(),
            response_status: response.status,
          },
          "Discord milestone webhook request failed",
        );
        return false;
      }

      return true;
    } catch (error) {
      logger.error(
        {
          ...serializeError(error),
        },
        "Discord milestone transport failed",
      );
      return false;
    }
  }
}

export class DiscordMilestoneRepository
  implements DiscordMilestoneRepositoryLike
{
  private initialized = false;

  async ensureTable(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const prisma = await this.loadPrisma();

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "DiscordMilestone" (
        "threshold" INTEGER NOT NULL PRIMARY KEY,
        "status" TEXT NOT NULL,
        "attemptCount" INTEGER NOT NULL DEFAULT 0,
        "totalTransactions" INTEGER NOT NULL,
        "totalFeeStroops" BIGINT NOT NULL,
        "lastAttemptAt" DATETIME,
        "firedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.initialized = true;
  }

  async getByThreshold(threshold: number): Promise<DiscordMilestoneRecord | null> {
    const prisma = await this.loadPrisma();
    const rows = await prisma.$queryRawUnsafe<DiscordMilestoneRow[]>(
      `
        SELECT
          "threshold",
          "status",
          "attemptCount",
          "totalTransactions",
          "totalFeeStroops",
          "lastAttemptAt",
          "firedAt"
        FROM "DiscordMilestone"
        WHERE "threshold" = ?
        LIMIT 1
      `,
      threshold,
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      attemptCount: Number(row.attemptCount),
      firedAt: row.firedAt ? new Date(row.firedAt) : null,
      lastAttemptAt: row.lastAttemptAt ? new Date(row.lastAttemptAt) : null,
      status: row.status === "sent" ? "sent" : "pending",
      threshold: Number(row.threshold),
      totalFeeStroops: Number(row.totalFeeStroops),
      totalTransactions: Number(row.totalTransactions),
    };
  }

  async saveAttempt(
    payload: DiscordMilestonePayload & {
      status: "pending" | "sent";
    },
  ): Promise<void> {
    const prisma = await this.loadPrisma();
    const attemptedAt = payload.timestamp.toISOString();
    const firedAt =
      payload.status === "sent" ? payload.timestamp.toISOString() : null;

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "DiscordMilestone" (
          "threshold",
          "status",
          "attemptCount",
          "totalTransactions",
          "totalFeeStroops",
          "lastAttemptAt",
          "firedAt",
          "updatedAt"
        )
        VALUES (?, ?, 1, ?, ?, ?, ?, ?)
        ON CONFLICT("threshold")
        DO UPDATE SET
          "status" = excluded."status",
          "attemptCount" = "DiscordMilestone"."attemptCount" + 1,
          "totalTransactions" = excluded."totalTransactions",
          "totalFeeStroops" = excluded."totalFeeStroops",
          "lastAttemptAt" = excluded."lastAttemptAt",
          "firedAt" = CASE
            WHEN excluded."status" = 'sent' THEN excluded."firedAt"
            ELSE "DiscordMilestone"."firedAt"
          END,
          "updatedAt" = excluded."updatedAt"
      `,
      payload.threshold,
      payload.status,
      payload.totalTransactions,
      payload.totalFeeStroops,
      attemptedAt,
      firedAt,
      attemptedAt,
    );
  }

  private async loadPrisma(): Promise<any> {
    const prismaModule = await import("../utils/db");
    return prismaModule.default;
  }
}

interface SponsoredTransactionTotals {
  totalFeeStroops: number;
  totalTransactions: number;
}

type SponsoredTransactionTotalsProvider = () => Promise<SponsoredTransactionTotals>;
type UptimeProvider = () => number;

async function loadSponsoredTransactionTotals(): Promise<SponsoredTransactionTotals> {
  const module = await import("../models/transactionLedger");
  return module.getSponsoredTransactionTotals();
}

export class TransactionMilestoneService {
  private readonly inflightThresholds = new Set<number>();

  constructor(
    private readonly options: DiscordMilestoneOptions = loadDiscordMilestoneOptionsFromEnv(),
    private readonly notifier: DiscordMilestoneNotifierLike = new DiscordMilestoneNotifier(
      options,
    ),
    private readonly repository: DiscordMilestoneRepositoryLike = new DiscordMilestoneRepository(),
    private readonly totalsProvider: SponsoredTransactionTotalsProvider = loadSponsoredTransactionTotals,
    private readonly uptimeProvider: UptimeProvider = () => process.uptime() * 1000,
  ) {}

  async checkForMilestones(now: Date = new Date()): Promise<number[]> {
    if (!this.notifier.isConfigured() || this.options.thresholds.length === 0) {
      return [];
    }

    await this.repository.ensureTable();
    const totals = await this.totalsProvider();
    const firedThresholds: number[] = [];

    for (const threshold of this.options.thresholds) {
      if (totals.totalTransactions < threshold) {
        continue;
      }

      if (this.inflightThresholds.has(threshold)) {
        continue;
      }

      const existing = await this.repository.getByThreshold(threshold);
      if (existing?.status === "sent") {
        continue;
      }

      this.inflightThresholds.add(threshold);

      try {
        const payload: DiscordMilestonePayload = {
          threshold,
          timestamp: now,
          totalFeeStroops: totals.totalFeeStroops,
          totalTransactions: totals.totalTransactions,
          uptimeMs: this.uptimeProvider(),
        };

        const sent = await this.notifier.notifyMilestone(payload);
        await this.repository.saveAttempt({
          ...payload,
          status: sent ? "sent" : "pending",
        });

        if (sent) {
          firedThresholds.push(threshold);
        }
      } catch (error) {
        logger.error(
          {
            ...serializeError(error),
            threshold,
          },
          "Discord milestone evaluation failed",
        );
      } finally {
        this.inflightThresholds.delete(threshold);
      }
    }

    return firedThresholds;
  }
}

export const transactionMilestoneService = new TransactionMilestoneService();
