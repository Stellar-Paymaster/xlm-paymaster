import { createLogger, serializeError } from "../utils/logger";
import prisma from "../utils/db";

const logger = createLogger({ component: "partitionMaintenanceWorker" });

// Runs at 00:05 on the 1st of every month
const DEFAULT_CRON_SCHEDULE = "5 0 1 * *";
const RETENTION_MONTHS = 24;
const LOOKAHEAD_MONTHS = 3;

export interface CronScheduler {
  schedule: (expression: string, callback: () => void) => { stop: () => void };
  validate: (expression: string) => boolean;
}

function partitionName(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `transaction_y${y}_m${m}`;
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
  return d;
}

export async function ensurePartitionsExist(): Promise<void> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  for (let i = 0; i <= LOOKAHEAD_MONTHS; i++) {
    const from = addMonths(monthStart, i);
    const to = addMonths(monthStart, i + 1);
    const name = partitionName(from);
    const fromIso = from.toISOString().replace("T", " ").replace(".000Z", "");
    const toIso = to.toISOString().replace("T", " ").replace(".000Z", "");

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${JSON.stringify(name)}
        PARTITION OF "Transaction"
        FOR VALUES FROM ('${fromIso}') TO ('${toIso}')
    `);

    logger.info({ partition: name, from: fromIso, to: toIso }, "Partition ensured");
  }
}

export async function dropOldPartitions(): Promise<void> {
  const now = new Date();
  const cutoff = addMonths(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    -RETENTION_MONTHS,
  );

  // List all child partitions of the Transaction table
  const rows = await prisma.$queryRaw<{ relname: string }[]>`
    SELECT c.relname
    FROM   pg_inherits i
    JOIN   pg_class    p ON p.oid = i.inhparent
    JOIN   pg_class    c ON c.oid = i.inhrelid
    WHERE  p.relname = 'Transaction'
  `;

  for (const { relname } of rows) {
    // Only touch partitions matching our naming convention
    const match = relname.match(/^transaction_y(\d{4})_m(\d{2})$/);
    if (!match) continue;

    const partitionDate = new Date(Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, 1));
    if (partitionDate < cutoff) {
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${JSON.stringify(relname)}`);
      logger.info({ partition: relname }, "Dropped expired partition");
    }
  }
}

export class PartitionMaintenanceWorker {
  private task: { stop: () => void } | null = null;
  private readonly cronSchedule: string;
  private readonly scheduler: CronScheduler;

  constructor(options: { cronSchedule?: string; scheduler?: CronScheduler } = {}) {
    this.cronSchedule = options.cronSchedule ?? DEFAULT_CRON_SCHEDULE;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this.scheduler = options.scheduler ?? (require("node-cron") as CronScheduler);
  }

  start(): void {
    if (!this.scheduler.validate(this.cronSchedule)) {
      logger.error({ schedule: this.cronSchedule }, "Invalid cron schedule — partition maintenance disabled");
      return;
    }

    logger.info({ schedule: this.cronSchedule }, "Starting partition maintenance worker");

    // Run once immediately on startup to catch any missing partitions
    void this.runNow();

    this.task = this.scheduler.schedule(this.cronSchedule, () => {
      void this.runNow();
    });
  }

  stop(): void {
    if (!this.task) return;
    this.task.stop();
    this.task = null;
    logger.info("Stopped partition maintenance worker");
  }

  async runNow(): Promise<void> {
    logger.info("Running partition maintenance");
    try {
      await ensurePartitionsExist();
      await dropOldPartitions();
      logger.info("Partition maintenance complete");
    } catch (error) {
      logger.error({ ...serializeError(error) }, "Partition maintenance failed");
    }
  }
}

export function initializePartitionMaintenanceWorker(): PartitionMaintenanceWorker {
  return new PartitionMaintenanceWorker();
}
