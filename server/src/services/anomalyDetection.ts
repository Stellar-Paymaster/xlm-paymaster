import { prisma } from "../utils/db";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "anomaly_detection" });
const STROOPS_PER_XLM = 10_000_000;
const BASELINE_DAYS = Number(process.env.ANOMALY_BASELINE_DAYS) || 7;
const ANOMALY_MULTIPLIER = Number(process.env.ANOMALY_DETECTION_MULTIPLIER) || 3.0;

export interface SpendMetrics {
  tenantId: string;
  hourStart: Date;
  actualSpendStroops: bigint;
  baselineDailyStroops: bigint;
  multiplier: number;
  riskScore: number;
}

export interface FlaggedEventInput {
  tenantId: string;
  hourStart: Date;
  actualSpendStroops: bigint;
  baselineDailyStroops: bigint;
  multiplier: number;
  riskScore: number;
  metadata?: Record<string, any>;
}

export interface BaselineUpdate {
  tenantId: string;
  dailyAvgStroops: bigint;
  hourlyAvgStroops: bigint;
  totalTransactions: number;
}

/**
 * Calculate 7-day rolling baseline spend profile for a tenant
 */
export async function calculateBaseline(tenantId: string): Promise<BaselineUpdate | null> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - BASELINE_DAYS);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const transactions = await prisma.transaction.findMany({
      where: {
        tenantId,
        createdAt: { gte: sevenDaysAgo },
        status: "SUCCESS"
      },
      select: {
        costStroops: true,
        createdAt: true
      }
    });

    if (transactions.length === 0) {
      logger.warn({ tenantId }, "No transactions found for baseline calculation");
      return null;
    }

    const totalSpendStroops = transactions.reduce(
      (sum, tx) => sum + BigInt(tx.costStroops),
      BigInt(0)
    );

    const dailyAvgStroops = totalSpendStroops / BigInt(BASELINE_DAYS);
    const hourlyAvgStroops = dailyAvgStroops / BigInt(24);

    logger.info({
      tenantId,
      totalTransactions: transactions.length,
      dailyAvgXlm: Number(dailyAvgStroops) / STROOPS_PER_XLM,
      hourlyAvgXlm: Number(hourlyAvgStroops) / STROOPS_PER_XLM
    }, "Calculated spend baseline");

    return {
      tenantId,
      dailyAvgStroops,
      hourlyAvgStroops,
      totalTransactions: transactions.length
    };
  } catch (error) {
    logger.error({ tenantId, error: String(error) }, "Failed to calculate baseline");
    throw error;
  }
}

/**
 * Update or create spend baseline for a tenant
 */
export async function updateSpendBaseline(tenantId: string): Promise<void> {
  try {
    const baseline = await calculateBaseline(tenantId);
    if (!baseline) return;

    await prisma.spendBaseline.upsert({
      where: { tenantId },
      update: {
        dailyAvgStroops: baseline.dailyAvgStroops,
        hourlyAvgStroops: baseline.hourlyAvgStroops,
        totalTransactions: baseline.totalTransactions,
        lastUpdated: new Date()
      },
      create: {
        tenantId,
        dailyAvgStroops: baseline.dailyAvgStroops,
        hourlyAvgStroops: baseline.hourlyAvgStroops,
        totalTransactions: baseline.totalTransactions
      }
    });

    logger.info({ tenantId }, "Updated spend baseline");
  } catch (error) {
    logger.error({ tenantId, error: String(error) }, "Failed to update spend baseline");
    throw error;
  }
}

/**
 * Get spend in the current hour for a tenant
 */
export async function getCurrentHourSpend(tenantId: string): Promise<bigint> {
  const now = new Date();
  const hourStart = new Date(now);
  hourStart.setMinutes(0, 0, 0);

  const transactions = await prisma.transaction.findMany({
    where: {
      tenantId,
      createdAt: { gte: hourStart },
      status: "SUCCESS"
    },
    select: { costStroops: true }
  });

  return transactions.reduce(
    (sum, tx) => sum + BigInt(tx.costStroops),
    BigInt(0)
  );
}

/**
 * Calculate risk score based on multiple factors
 */
function calculateRiskScore(
  multiplier: number,
  transactionCount: number,
  isNewTenant: boolean
): number {
  let riskScore = 0.0;

  // Base risk from multiplier
  riskScore += Math.min((multiplier - 1) / 10, 0.6);

  // Risk from high transaction volume
  if (transactionCount > 100) {
    riskScore += 0.2;
  } else if (transactionCount > 50) {
    riskScore += 0.1;
  }

  // New tenant penalty
  if (isNewTenant) {
    riskScore += 0.2;
  }

  return Math.min(riskScore, 1.0);
}

/**
 * Check for anomalies in current hour spend
 */
export async function checkAnomalies(tenantId: string): Promise<SpendMetrics | null> {
  try {
    const baseline = await prisma.spendBaseline.findUnique({
      where: { tenantId }
    });

    if (!baseline) {
      logger.debug({ tenantId }, "No baseline found for tenant");
      return null;
    }

    const now = new Date();
    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0);

    const actualSpendStroops = await getCurrentHourSpend(tenantId);

    // Compare against daily average (more conservative than hourly)
    const multiplier = Number(actualSpendStroops) / Number(baseline.dailyAvgStroops);

    if (multiplier < ANOMALY_MULTIPLIER) {
      return null;
    }

    // Get transaction count for risk scoring
    const transactionCount = await prisma.transaction.count({
      where: {
        tenantId,
        createdAt: { gte: hourStart },
        status: "SUCCESS"
      }
    });

    const isNewTenant = baseline.totalTransactions < 50;
    const riskScore = calculateRiskScore(multiplier, transactionCount, isNewTenant);

    logger.warn({
      tenantId,
      multiplier,
      actualSpendXlm: Number(actualSpendStroops) / STROOPS_PER_XLM,
      baselineDailyXlm: Number(baseline.dailyAvgStroops) / STROOPS_PER_XLM,
      riskScore,
      transactionCount
    }, "Anomaly detected");

    return {
      tenantId,
      hourStart,
      actualSpendStroops,
      baselineDailyStroops: baseline.dailyAvgStroops,
      multiplier,
      riskScore
    };
  } catch (error) {
    logger.error({ tenantId, error: String(error) }, "Failed to check anomalies");
    throw error;
  }
}

/**
 * Create a flagged event for anomaly
 */
export async function createFlaggedEvent(input: FlaggedEventInput): Promise<void> {
  try {
    await prisma.flaggedEvent.create({
      data: {
        tenantId: input.tenantId,
        eventDate: new Date(),
        hourStart: input.hourStart,
        actualSpendStroops: input.actualSpendStroops,
        baselineDailyStroops: input.baselineDailyStroops,
        multiplier: input.multiplier,
        riskScore: input.riskScore,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null
      }
    });

    logger.info({
      tenantId: input.tenantId,
      multiplier: input.multiplier,
      riskScore: input.riskScore
    }, "Created flagged event");
  } catch (error) {
    logger.error({
      tenantId: input.tenantId,
      error: String(error)
    }, "Failed to create flagged event");
    throw error;
  }
}

/**
 * Run anomaly detection for all active tenants
 */
export async function runAnomalyDetection(): Promise<void> {
  try {
    const tenants = await prisma.tenant.findMany({
      where: {
        deletedAt: null,
        // Only check tenants with recent activity
        sponsoredTransactions: {
          some: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days
            }
          }
        }
      },
      select: { id: true }
    });

    logger.info({ tenantCount: tenants.length }, "Starting anomaly detection");

    for (const tenant of tenants) {
      try {
        // Update baseline first
        await updateSpendBaseline(tenant.id);

        // Check for anomalies
        const anomaly = await checkAnomalies(tenant.id);
        if (anomaly) {
          await createFlaggedEvent({
            tenantId: anomaly.tenantId,
            hourStart: anomaly.hourStart,
            actualSpendStroops: anomaly.actualSpendStroops,
            baselineDailyStroops: anomaly.baselineDailyStroops,
            multiplier: anomaly.multiplier,
            riskScore: anomaly.riskScore,
            metadata: {
              detectedAt: new Date().toISOString(),
              threshold: ANOMALY_MULTIPLIER
            }
          });
        }
      } catch (error) {
        logger.error({
          tenantId: tenant.id,
          error: String(error)
        }, "Failed to process tenant for anomaly detection");
      }
    }

    logger.info("Completed anomaly detection run");
  } catch (error) {
    logger.error({ error: String(error) }, "Failed to run anomaly detection");
    throw error;
  }
}

/**
 * Get pending flagged events for admin review
 */
export async function getPendingFlaggedEvents(): Promise<any[]> {
  try {
    const events = await prisma.flaggedEvent.findMany({
      where: { status: "pending" },
      include: {
        tenant: {
          select: { name: true }
        }
      },
      orderBy: {
        riskScore: "desc",
        createdAt: "desc"
      }
    });

    return events.map(event => ({
      id: event.id,
      tenantId: event.tenantId,
      tenantName: event.tenant.name,
      eventDate: event.eventDate,
      hourStart: event.hourStart,
      actualSpendXlm: Number(event.actualSpendStroops) / STROOPS_PER_XLM,
      baselineDailyXlm: Number(event.baselineDailyStroops) / STROOPS_PER_XLM,
      multiplier: event.multiplier,
      riskScore: event.riskScore,
      metadata: event.metadata ? JSON.parse(event.metadata) : null,
      createdAt: event.createdAt
    }));
  } catch (error) {
    logger.error({ error: String(error) }, "Failed to get pending flagged events");
    throw error;
  }
}
