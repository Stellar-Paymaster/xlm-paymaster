import prisma from "../utils/db";
import { logger } from "../utils/logger";

export interface TenantUsageMetrics {
  tenantId: string;
  date: Date;
  requestCount: number;
  violationCount: number;
  burstScore: number;
  avgRequestRate: number;
}

export interface UsageScoreResult {
  tenantId: string;
  thirtyDayAvg: number;
  violationFreeDays: number;
  burstBehavior: number;
  recommendationScore: number; // 0-100, higher means better for upgrade
}

export class TenantUsageTracker {
  /**
   * Record a request for a tenant
   */
  async recordRequest(tenantId: string): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    try {
      await prisma.tenantUsageStats.upsert({
        where: {
          tenantId_date: {
            tenantId,
            date: today,
          },
        },
        update: {
          requestCount: {
            increment: 1,
          },
          updatedAt: new Date(),
        },
        create: {
          tenantId,
          date: today,
          requestCount: 1,
        },
      });
    } catch (error) {
      logger.error("Failed to record request", {
        tenantId,
        error: error instanceof Error ? error.message : String(error)
      } as any);
    }
  }

  /**
   * Record a rate limit violation for a tenant
   */
  async recordViolation(tenantId: string): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    try {
      await prisma.tenantUsageStats.upsert({
        where: {
          tenantId_date: {
            tenantId,
            date: today,
          },
        },
        update: {
          violationCount: {
            increment: 1,
          },
          updatedAt: new Date(),
        },
        create: {
          tenantId,
          date: today,
          violationCount: 1,
        },
      });
    } catch (error) {
      logger.error("Failed to record violation", {
        tenantId,
        error: error instanceof Error ? error.message : String(error)
      } as any);
    }
  }

  /**
   * Calculate burst score based on request patterns
   * Higher score indicates more bursty behavior (less desirable)
   */
  async calculateBurstScore(tenantId: string, date: Date): Promise<number> {
    // Get hourly request distribution for the day
    const hourlyStats = await prisma.$queryRaw<Array<{ hour: number; count: number }>>`
      SELECT 
        CAST(strftime('%H', createdAt) AS INTEGER) as hour,
        COUNT(*) as count
      FROM TenantUsageStats 
      WHERE tenantId = ${tenantId} 
        AND date(date) = date(${date.toISOString().split('T')[0]})
      GROUP BY hour
      ORDER BY hour
    `;

    if (hourlyStats.length === 0) return 0;

    const counts = hourlyStats.map((stat: any) => stat.count);
    const totalRequests = counts.reduce((sum: number, count: number) => sum + count, 0);

    if (totalRequests === 0) return 0;

    const avgRequestsPerHour = totalRequests / 24;
    const variance = counts.reduce((sum: number, count: number) => {
      const diff = count - avgRequestsPerHour;
      return sum + (diff * diff);
    }, 0) / 24;

    // Normalize variance to 0-1 scale (using coefficient of variation)
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = avgRequestsPerHour > 0 ? stdDev / avgRequestsPerHour : 0;

    // Cap at 1.0 and normalize
    return Math.min(coefficientOfVariation / 2, 1.0);
  }

  /**
   * Calculate average request rate per minute for a day
   */
  async calculateAvgRequestRate(tenantId: string, date: Date): Promise<number> {
    const stats = await prisma.tenantUsageStats.findUnique({
      where: {
        tenantId_date: {
          tenantId,
          date: date.toISOString().split('T')[0],
        },
      },
    });

    return stats ? stats.requestCount / (24 * 60) : 0; // requests per minute
  }

  /**
   * Get 30-day rolling average and other metrics for a tenant
   */
  async getUsageScore(tenantId: string): Promise<UsageScoreResult> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

    const stats = await prisma.tenantUsageStats.findMany({
      where: {
        tenantId,
        date: {
          gte: thirtyDaysAgo,
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    if (stats.length === 0) {
      return {
        tenantId,
        thirtyDayAvg: 0,
        violationFreeDays: 0,
        burstBehavior: 0,
        recommendationScore: 0,
      };
    }

    // Calculate 30-day average usage (normalized against their rate limit)
    const totalRequests = stats.reduce((sum: number, stat: any) => sum + stat.requestCount, 0);
    const avgDailyRequests = totalRequests / stats.length;

    // Get tenant's current rate limit
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { subscriptionTier: true },
    });

    const rateLimit = tenant?.subscriptionTier?.rateLimit || 100;
    const normalizedUsage = Math.min(avgDailyRequests / rateLimit, 1.0);

    // Calculate violation-free days (consecutive days from today backwards)
    let violationFreeDays = 0;
    for (const stat of stats) {
      if (stat.violationCount === 0) {
        violationFreeDays++;
      } else {
        break;
      }
    }

    // Calculate average burst behavior
    const avgBurstScore = stats.reduce((sum: number, stat: any) => sum + stat.burstScore, 0) / stats.length;

    // Calculate recommendation score (0-100)
    // Factors: consistent usage (60%), no violations (30%), low burstiness (10%)
    const consistencyScore = normalizedUsage * 60; // Higher usage within limits is better
    const violationScore = Math.min((violationFreeDays / 14) * 30, 30); // 14 days violation-free = full points
    const burstScore = Math.max((1 - avgBurstScore) * 10, 0); // Lower burstiness is better

    const recommendationScore = Math.min(consistencyScore + violationScore + burstScore, 100);

    return {
      tenantId,
      thirtyDayAvg: normalizedUsage,
      violationFreeDays,
      burstBehavior: avgBurstScore,
      recommendationScore,
    };
  }

  /**
   * Update daily statistics for all tenants (called by daily job)
   */
  async updateDailyStats(): Promise<void> {
    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (const tenant of tenants) {
      try {
        const burstScore = await this.calculateBurstScore(tenant.id, today);
        const avgRequestRate = await this.calculateAvgRequestRate(tenant.id, today);

        await prisma.tenantUsageStats.upsert({
          where: {
            tenantId_date: {
              tenantId: tenant.id,
              date: today,
            },
          },
          update: {
            burstScore,
            avgRequestRate,
            updatedAt: new Date(),
          },
          create: {
            tenantId: tenant.id,
            date: today,
            burstScore,
            avgRequestRate,
          },
        });
      } catch (error: unknown) {
        logger.error("Failed to update daily stats", {
          tenantId: tenant.id,
          error: error instanceof Error ? error.message : String(error),
        } as any);
      }
    }

    logger.info(`Updated daily stats for ${tenants.length} tenants`);
  }
  /**
   * Get tenants eligible for tier upgrade
   */
  async getUpgradeCandidates(minScore: number = 80): Promise<UsageScoreResult[]> {
    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    const scores: UsageScoreResult[] = [];
    for (const tenant of tenants) {
      const score = await this.getUsageScore(tenant.id);
      if (score.recommendationScore >= minScore && score.violationFreeDays >= 14) {
        scores.push(score);
      }
    }

    return scores.sort((a, b) => b.recommendationScore - a.recommendationScore);
  }
}
