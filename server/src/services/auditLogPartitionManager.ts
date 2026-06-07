/**
 * Audit Log Partition Manager (Issue #711)
 *
 * Manages monthly partitions for the AuditLog table.  Provides:
 *  - Automatic creation of the next month's partition before it is needed.
 *  - Listing of existing partitions.
 *  - Pruning of partitions older than a configurable retention window.
 *
 * This service is designed to run as a scheduled task (e.g. monthly cron)
 * and is safe to call multiple times — all DDL operations are idempotent.
 */

import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "audit_log_partition_manager" });

export interface PartitionInfo {
  name: string;
  /** ISO date string for the start of the partition range (inclusive). */
  rangeStart: string;
  /** ISO date string for the end of the partition range (exclusive). */
  rangeEnd: string;
}

export interface PartitionManagerOptions {
  /** Number of months of history to retain.  Partitions older than this are
   *  eligible for pruning.  Default: 24. */
  retentionMonths?: number;
  /** Number of future months to pre-create.  Default: 3. */
  futureMonths?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a Date as a YYYY-MM-DD string (UTC). */
function toYearMonth(date: Date): { year: number; month: number } {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/** Build the partition table name for a given year/month. */
export function partitionName(year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  return `audit_log_y${year}_m${mm}`;
}

/** Build the lower bound timestamp for a partition (inclusive). */
export function partitionStart(year: number, month: number): string {
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-01 00:00:00`;
}

/** Build the upper bound timestamp for a partition (exclusive). */
export function partitionEnd(year: number, month: number): string {
  const next = new Date(Date.UTC(year, month, 1)); // month is 0-indexed here
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, "0");
  return `${ny}-${nm}-01 00:00:00`;
}

/** Add `n` months to a {year, month} pair. */
export function addMonths(
  year: number,
  month: number,
  n: number,
): { year: number; month: number } {
  const total = (year * 12 + (month - 1)) + n;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/** Subtract `n` months from a {year, month} pair. */
export function subtractMonths(
  year: number,
  month: number,
  n: number,
): { year: number; month: number } {
  return addMonths(year, month, -n);
}

// ---------------------------------------------------------------------------
// Partition manager
// ---------------------------------------------------------------------------

export class AuditLogPartitionManager {
  private readonly retentionMonths: number;
  private readonly futureMonths: number;

  constructor(options: PartitionManagerOptions = {}) {
    this.retentionMonths = options.retentionMonths ?? 24;
    this.futureMonths = options.futureMonths ?? 3;
  }

  /**
   * Ensure all required partitions exist for the window
   * [now - retentionMonths, now + futureMonths].
   *
   * @param executor  A function that executes a raw SQL statement.
   *                  Receives the SQL string and returns a Promise.
   */
  async ensurePartitions(
    executor: (sql: string) => Promise<unknown>,
  ): Promise<string[]> {
    const now = new Date();
    const { year: cy, month: cm } = toYearMonth(now);
    const start = subtractMonths(cy, cm, this.retentionMonths);
    const end = addMonths(cy, cm, this.futureMonths);

    const created: string[] = [];
    let cur = start;

    while (
      cur.year < end.year ||
      (cur.year === end.year && cur.month <= end.month)
    ) {
      const name = partitionName(cur.year, cur.month);
      const from = partitionStart(cur.year, cur.month);
      const to = partitionEnd(cur.year, cur.month);

      const sql = `
        CREATE TABLE IF NOT EXISTS "${name}"
          PARTITION OF "AuditLog"
          FOR VALUES FROM ('${from}') TO ('${to}')
      `.trim();

      try {
        await executor(sql);
        created.push(name);
        logger.debug({ partition: name }, "Partition ensured");
      } catch (err: unknown) {
        // "already exists" errors are safe to ignore.
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("already exists")) {
          logger.error({ partition: name, err: msg }, "Failed to create partition");
          throw err;
        }
      }

      cur = addMonths(cur.year, cur.month, 1);
    }

    return created;
  }

  /**
   * List existing audit log partitions by querying the PostgreSQL catalog.
   *
   * @param query  A function that executes a raw SQL query and returns rows.
   */
  async listPartitions(
    query: (sql: string) => Promise<Array<{ tablename: string }>>,
  ): Promise<PartitionInfo[]> {
    const rows = await query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename LIKE 'audit_log_y%'
      ORDER BY tablename
    `);

    return rows.map((row) => {
      const name = row.tablename;
      // Parse year/month from name: audit_log_y<YYYY>_m<MM>
      const match = /audit_log_y(\d{4})_m(\d{2})/.exec(name);
      if (!match) {
        return { name, rangeStart: "", rangeEnd: "" };
      }
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      return {
        name,
        rangeStart: partitionStart(year, month),
        rangeEnd: partitionEnd(year, month),
      };
    });
  }

  /**
   * Drop partitions older than `retentionMonths`.
   *
   * @param executor  A function that executes a raw SQL statement.
   * @param query     A function that lists existing partitions.
   * @returns Names of dropped partitions.
   */
  async pruneOldPartitions(
    executor: (sql: string) => Promise<unknown>,
    query: (sql: string) => Promise<Array<{ tablename: string }>>,
  ): Promise<string[]> {
    const now = new Date();
    const { year: cy, month: cm } = toYearMonth(now);
    const cutoff = subtractMonths(cy, cm, this.retentionMonths);

    const partitions = await this.listPartitions(query);
    const dropped: string[] = [];

    for (const p of partitions) {
      const match = /audit_log_y(\d{4})_m(\d{2})/.exec(p.name);
      if (!match) continue;

      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);

      const isBefore =
        year < cutoff.year || (year === cutoff.year && month < cutoff.month);

      if (isBefore) {
        try {
          await executor(`DROP TABLE IF EXISTS "${p.name}"`);
          dropped.push(p.name);
          logger.info({ partition: p.name }, "Pruned old audit log partition");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error({ partition: p.name, err: msg }, "Failed to prune partition");
        }
      }
    }

    return dropped;
  }
}
