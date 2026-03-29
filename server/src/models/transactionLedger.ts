import prisma from "../utils/db";

export interface SponsoredTransactionRecord {
  id: string;
  tenantId: string;
  feeStroops: number;
  createdAt: Date;
}

export interface SponsoredTransactionTotals {
  totalFeeStroops: number;
  totalTransactions: number;
}

function getUtcDayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export function getUtcMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  const end = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0)
  );
  return { start, end };
}

export interface TenantMonthSponsoredTotals {
  txCount: number;
  feeStroops: number;
}

export async function getTenantMonthSponsoredTotals(
  tenantId: string,
  now: Date = new Date()
): Promise<TenantMonthSponsoredTotals> {
  const { start, end } = getUtcMonthRange(now);
  const [agg, count] = await Promise.all([
    prisma.sponsoredTransaction.aggregate({
      where: { tenantId, createdAt: { gte: start, lt: end } },
      _sum: { feeStroops: true },
    }),
    prisma.sponsoredTransaction.count({
      where: { tenantId, createdAt: { gte: start, lt: end } },
    }),
  ]);
  return {
    txCount: count,
    feeStroops: Number(agg._sum.feeStroops ?? 0),
  };
}

export interface TenantDailyUsagePoint {
  date: string;
  txCount: number;
  feeStroops: number;
}

/** Last `days` UTC calendar days through `now` (inclusive), zero-filled. */
export async function getTenantSponsoredDailySeries(
  tenantId: string,
  days: number,
  now: Date = new Date()
): Promise<TenantDailyUsagePoint[]> {
  const safeDays = Math.min(Math.max(Math.floor(days), 1), 90);
  const orderedDates: string[] = [];
  for (let i = 0; i < safeDays; i++) {
    const d = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - (safeDays - 1 - i),
        0,
        0,
        0,
        0
      )
    );
    orderedDates.push(d.toISOString().slice(0, 10));
  }
  const start = new Date(`${orderedDates[0]}T00:00:00.000Z`);
  const endExclusive = new Date(start);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + safeDays);

  const rows = await prisma.sponsoredTransaction.findMany({
    where: {
      tenantId,
      createdAt: { gte: start, lt: endExclusive },
    },
    select: { createdAt: true, feeStroops: true },
  });

  const byDay = new Map<string, TenantDailyUsagePoint>(
    orderedDates.map((date) => [date, { date, txCount: 0, feeStroops: 0 }])
  );
  for (const row of rows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    const bucket = byDay.get(key);
    if (bucket) {
      bucket.txCount += 1;
      bucket.feeStroops += Number(row.feeStroops);
    }
  }
  return orderedDates.map((d) => byDay.get(d)!);
}

export async function recordSponsoredTransaction(
  tenantId: string,
  feeStroops: number,
  createdAt: Date = new Date()
): Promise<SponsoredTransactionRecord> {
  const record = await prisma.sponsoredTransaction.create({
    data: { tenantId, feeStroops: BigInt(feeStroops), createdAt },
  });
  return {
    id: record.id,
    tenantId: record.tenantId,
    feeStroops: Number(record.feeStroops),
    createdAt: record.createdAt,
  };
}

export async function getTenantDailySpendStroops(
  tenantId: string,
  now: Date = new Date()
): Promise<number> {
  const { start, end } = getUtcDayRange(now);
  const result = await prisma.sponsoredTransaction.aggregate({
    where: { tenantId, createdAt: { gte: start, lt: end } },
    _sum: { feeStroops: true },
  });
  return Number(result._sum.feeStroops ?? 0);
}

export async function getTenantDailyTransactionCount(
  tenantId: string,
  now: Date = new Date()
): Promise<number> {
  const { start, end } = getUtcDayRange(now);
  return prisma.sponsoredTransaction.count({
    where: { tenantId, createdAt: { gte: start, lt: end } },
  });
}
