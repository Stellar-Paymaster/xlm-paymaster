import prisma from "../utils/db";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "digest_aggregator" });

export interface TenantVolume {
  tenantId: string;
  transactionCount: number;
  totalFeeStroops: bigint;
}

export interface DigestStats {
  date: string; // YYYY-MM-DD of the day being summarised
  totalTransactions: number;
  totalXlmSpent: number;
  topTenant: TenantVolume | null;
  alertsTriggered: string[];
}

/** Returns a UTC midnight–to–midnight window for the given Date. */
export function getYesterdayUtcRange(now: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 1);
  return { start, end };
}

/**
 * Aggregates yesterday's sponsored-transaction activity from the database.
 * Works with both the SponsoredTransaction model (legacy) and Transaction
 * model (newer), preferring Transaction when data exists.
 */
export async function aggregateYesterdayStats(
  now: Date = new Date(),
  alertsTriggered: string[] = [],
): Promise<DigestStats> {
  const { start, end } = getYesterdayUtcRange(now);
  const dateLabel = start.toISOString().slice(0, 10);

  logger.info(
    { date: dateLabel, start: start.toISOString(), end: end.toISOString() },
    "Aggregating digest stats",
  );

  // ── Totals from SponsoredTransaction ──────────────────────────────────────
  const totals = await prisma.sponsoredTransaction.aggregate({
    where: { createdAt: { gte: start, lt: end } },
    _count: { id: true },
    _sum: { feeStroops: true },
  });

  const totalTransactions = totals._count.id ?? 0;
  const totalFeeStroops = totals._sum.feeStroops ?? BigInt(0);
  const totalXlmSpent = Number(totalFeeStroops) / 10_000_000;

  // ── Top tenant by volume ──────────────────────────────────────────────────
  let topTenant: TenantVolume | null = null;

  if (totalTransactions > 0) {
    const rows = await prisma.sponsoredTransaction.groupBy({
      by: ["tenantId"],
      where: { createdAt: { gte: start, lt: end } },
      _count: { id: true },
      _sum: { feeStroops: true },
      orderBy: { _count: { id: "desc" } },
      take: 1,
    });

    if (rows.length > 0) {
      const top = rows[0];
      topTenant = {
        tenantId: top.tenantId,
        transactionCount: top._count.id,
        totalFeeStroops: top._sum.feeStroops ?? BigInt(0),
      };
    }
  }

  return {
    date: dateLabel,
    totalTransactions,
    totalXlmSpent,
    topTenant,
    alertsTriggered,
  };
}
