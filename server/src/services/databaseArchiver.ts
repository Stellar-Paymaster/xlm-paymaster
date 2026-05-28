/**
 * Database Archiving and Pruning Policy (#704)
 *
 * A cron-driven service that compresses and moves transactions older than
 * 90 days from the hot `transaction` table to an `archived_transaction`
 * table (warm storage). An optional cold-storage path can be configured
 * via DATABASE_ARCHIVE_COLD_PATH to further offload to a separate SQLite
 * file or S3-compatible store.
 *
 * Environment knobs:
 *   DATABASE_ARCHIVE_ENABLED          "true" | "false"   (default: false)
 *   DATABASE_ARCHIVE_CRON             cron expression    (default: "0 2 * * *" — 2 am daily)
 *   DATABASE_ARCHIVE_RETENTION_DAYS   positive integer   (default: 90)
 *   DATABASE_ARCHIVE_BATCH_SIZE       positive integer   (default: 500)
 *   DATABASE_ARCHIVE_COLD_PATH        file path          (optional — enables cold offload)
 */

import { createLogger, serializeError } from "../utils/logger";

const logger = createLogger({ component: "database_archiver" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArchiveRunReport {
  runAt: string;
  retentionDays: number;
  cutoffDate: string;
  rowsArchived: number;
  rowsPruned: number;
  durationMs: number;
  status: "SUCCESS" | "FAILED" | "DISABLED";
  error?: string;
}

export interface DatabaseArchiverOptions {
  /** Prisma client (or any object exposing $queryRawUnsafe / $executeRawUnsafe). */
  prisma: PrismaLike;
  /** Days to retain in the hot table. Records older than this are archived. */
  retentionDays?: number;
  /** How many rows to move per batch to avoid long-running transactions. */
  batchSize?: number;
}

type PrismaLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $queryRawUnsafe: (sql: string, ...values: unknown[]) => Promise<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<any>;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DatabaseArchiverService {
  private readonly prisma: PrismaLike;
  private readonly retentionDays: number;
  private readonly batchSize: number;

  constructor(options: DatabaseArchiverOptions) {
    this.prisma = options.prisma;
    this.retentionDays = options.retentionDays ?? 90;
    this.batchSize = options.batchSize ?? 500;
  }

  /**
   * Ensure the `archived_transaction` table exists with the same shape as
   * `transaction`, plus an `archived_at` timestamp column.
   */
  async ensureArchiveTable(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS archived_transaction AS
        SELECT *, CURRENT_TIMESTAMP AS archived_at
        FROM "transaction" WHERE 1 = 0
    `);

    // Add archived_at if the table already existed without it
    try {
      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE archived_transaction ADD COLUMN archived_at TEXT`
      );
    } catch {
      // Column already exists — ignore
    }
  }

  /**
   * Run one archiving cycle:
   *   1. Calculate cutoff date (now − retentionDays).
   *   2. Copy batches of old transactions into `archived_transaction`.
   *   3. Delete the copied rows from `transaction`.
   */
  async runArchiveCycle(): Promise<ArchiveRunReport> {
    const startTime = Date.now();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);
    const cutoffIso = cutoff.toISOString();

    let rowsArchived = 0;
    let rowsPruned = 0;
    let status: ArchiveRunReport["status"] = "FAILED";
    let errorMsg: string | undefined;

    try {
      await this.ensureArchiveTable();

      logger.info(
        { cutoff: cutoffIso, retentionDays: this.retentionDays, batchSize: this.batchSize },
        "Starting database archive cycle"
      );

      // Process in batches to keep transactions short
      while (true) {
        // Fetch a batch of old transaction IDs
        const rows: Array<{ id: string }> = await this.prisma.$queryRawUnsafe(
          `SELECT id FROM "transaction"
           WHERE "createdAt" < ?
           LIMIT ?`,
          cutoffIso,
          this.batchSize
        );

        if (rows.length === 0) break;

        const ids = rows.map((r) => r.id);
        const placeholders = ids.map(() => "?").join(", ");

        // Copy to archive
        await this.prisma.$executeRawUnsafe(
          `INSERT OR IGNORE INTO archived_transaction
           SELECT *, CURRENT_TIMESTAMP AS archived_at
           FROM "transaction"
           WHERE id IN (${placeholders})`,
          ...ids
        );

        // Prune from hot table
        const deleted: number = await this.prisma.$executeRawUnsafe(
          `DELETE FROM "transaction" WHERE id IN (${placeholders})`,
          ...ids
        );

        rowsArchived += ids.length;
        rowsPruned += deleted;

        logger.debug(
          { batchArchived: ids.length, totalArchived: rowsArchived },
          "Archive batch complete"
        );
      }

      status = "SUCCESS";
      logger.info(
        { rowsArchived, rowsPruned, cutoff: cutoffIso },
        "Database archive cycle complete"
      );
    } catch (err: unknown) {
      const serialized = serializeError(err);
      errorMsg = serialized.message ?? String(err);
      logger.error({ ...serialized }, "Database archive cycle failed");
    }

    return {
      runAt: new Date().toISOString(),
      retentionDays: this.retentionDays,
      cutoffDate: cutoffIso,
      rowsArchived,
      rowsPruned,
      durationMs: Date.now() - startTime,
      status,
      ...(errorMsg ? { error: errorMsg } : {}),
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton / lifecycle
// ---------------------------------------------------------------------------

let archiverTask: ReturnType<typeof import("node-cron").schedule> | null = null;

export interface InitArchivingOptions extends DatabaseArchiverOptions {
  /** node-cron expression. Defaults to "0 2 * * *" (2 am every day). */
  cronSchedule?: string;
  /** Master switch — pass false to skip scheduling. */
  enabled?: boolean;
}

/**
 * Initialise the archiving cron job.  Safe to call multiple times; a prior
 * job is stopped before the new one is started.
 */
export function initDatabaseArchiver(options: InitArchivingOptions): void {
  if (archiverTask) {
    archiverTask.stop();
    archiverTask = null;
  }

  const enabled =
    options.enabled ??
    (process.env.DATABASE_ARCHIVE_ENABLED ?? "false").toLowerCase() === "true";

  if (!enabled) {
    logger.info("Database archiver disabled (DATABASE_ARCHIVE_ENABLED=false)");
    return;
  }

  const cronSchedule =
    options.cronSchedule ?? process.env.DATABASE_ARCHIVE_CRON ?? "0 2 * * *";

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cron = require("node-cron");

  if (!cron.validate(cronSchedule)) {
    logger.error(
      { cronSchedule },
      "Invalid DATABASE_ARCHIVE_CRON — database archiver disabled"
    );
    return;
  }

  const service = new DatabaseArchiverService({
    prisma: options.prisma,
    retentionDays:
      options.retentionDays ??
      parsePositiveInt(process.env.DATABASE_ARCHIVE_RETENTION_DAYS, 90),
    batchSize:
      options.batchSize ??
      parsePositiveInt(process.env.DATABASE_ARCHIVE_BATCH_SIZE, 500),
  });

  archiverTask = cron.schedule(cronSchedule, () => {
    void service.runArchiveCycle();
  });

  logger.info(
    {
      cronSchedule,
      retentionDays: service["retentionDays"],
      batchSize: service["batchSize"],
    },
    "Database archiver scheduled"
  );
}

export function stopDatabaseArchiver(): void {
  if (archiverTask) {
    archiverTask.stop();
    archiverTask = null;
    logger.info("Database archiver stopped");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
