import prisma from "../utils/db";
import { logger } from "../utils/logger";
import { TenantUsageTracker, UsageScoreResult } from "./tenantUsageTracker";
import { SubscriptionTierCode, toTierCode } from "../models/subscriptionTier";

export interface TierAdjustmentResult {
  tenantId: string;
  fromTier: string;
  toTier: string;
  reason: "auto_upgrade" | "violation_demotion" | "admin_override";
  violationFreeDays: number;
  avgUsageScore: number;
  autoAdjusted: boolean;
  adjustedBy?: string;
}

export interface EmailNotificationData {
  tenantId: string;
  tenantName: string;
  tenantEmail?: string;
  fromTier: string;
  toTier: string;
  reason: string;
}

export class IntelligentRateLimiter {
  private usageTracker: TenantUsageTracker;

  // Tier hierarchy for upgrades (lower index = lower tier)
  private tierHierarchy: SubscriptionTierCode[] = [
    "free",
    "pro",
    "enterprise",
  ];

  constructor() {
    this.usageTracker = new TenantUsageTracker();
  }

  /**
   * Process automatic tier adjustments for all tenants
   */
  async processAutoAdjustments(): Promise<TierAdjustmentResult[]> {
    const results: TierAdjustmentResult[] = [];

    try {
      // Get all tenants with their current tiers
      const tenants = await prisma.tenant.findMany({
        where: { deletedAt: null },
        include: {
          subscriptionTier: true,
        },
      });

      for (const tenant of tenants) {
        const adjustment = await this.evaluateTenantForAdjustment(tenant as any);
        if (adjustment) {
          results.push(adjustment);
        }
      }

      logger.info(`Processed ${tenants.length} tenants, made ${results.length} adjustments`);
      return results;

    } catch (error) {
      logger.error("Failed to process auto-adjustments", {
        error: error instanceof Error ? error.message : String(error)
      } as any);
      throw error;
    }
  }

  /**
   * Evaluate a single tenant for potential tier adjustment
   */
  async evaluateTenantForAdjustment(tenant: any): Promise<TierAdjustmentResult | null> {
    try {
      const usageScore = await this.usageTracker.getUsageScore(tenant.id);
      const currentTierIndex = this.tierHierarchy.indexOf(toTierCode(tenant.subscriptionTier.name));

      // Check for upgrade eligibility
      if (this.isEligibleForUpgrade(usageScore, currentTierIndex)) {
        return await this.performTierUpgrade(tenant, usageScore);
      }

      // Check for downgrade eligibility (excessive violations)
      if (this.isEligibleForDowngrade(usageScore, currentTierIndex)) {
        return await this.performTierDowngrade(tenant, usageScore);
      }

      return null;

    } catch (error) {
      logger.error("Failed to evaluate tenant for adjustment", {
        tenantId: tenant.id,
        error: error instanceof Error ? error.message : String(error)
      } as any);
      return null;
    }
  }

  /**
   * Check if tenant is eligible for upgrade
   */
  private isEligibleForUpgrade(usageScore: UsageScoreResult, currentTierIndex: number): boolean {
    // Must be at least 14 days violation-free
    if (usageScore.violationFreeDays < 14) return false;

    // Must have good recommendation score
    if (usageScore.recommendationScore < 80) return false;

    // Must not already be at highest tier
    if (currentTierIndex >= this.tierHierarchy.length - 1) return false;

    // Must show consistent usage (not too low, not exceeding limits)
    if (usageScore.thirtyDayAvg < 0.3 || usageScore.thirtyDayAvg > 0.9) return false;

    return true;
  }

  /**
   * Check if tenant is eligible for downgrade
   */
  private isEligibleForDowngrade(usageScore: UsageScoreResult, currentTierIndex: number): boolean {
    // Already at lowest tier
    if (currentTierIndex <= 0) return false;

    // Multiple violations in recent days
    if (usageScore.violationFreeDays < 7) return false;

    // Very high burst behavior indicates abuse
    if (usageScore.burstBehavior > 0.8) return true;

    return false;
  }

  /**
   * Perform tier upgrade
   */
  private async performTierUpgrade(tenant: any, usageScore: UsageScoreResult): Promise<TierAdjustmentResult> {
    const currentTierIndex = this.tierHierarchy.indexOf(toTierCode(tenant.subscriptionTier.name));
    const nextTierCode = this.tierHierarchy[currentTierIndex + 1];

    const nextTier = await prisma.subscriptionTier.findFirst({
      where: { name: nextTierCode },
    });

    if (!nextTier) {
      throw new Error(`Next tier ${nextTierCode} not found`);
    }

    // Update tenant's subscription tier
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { subscriptionTierId: nextTier.id },
    });

    // Record the adjustment
    const adjustment = await prisma.tierAdjustment.create({
      data: {
        tenantId: tenant.id,
        fromTierId: tenant.subscriptionTier.id,
        toTierId: nextTier.id,
        reason: "auto_upgrade",
        violationFreeDays: usageScore.violationFreeDays,
        avgUsageScore: usageScore.thirtyDayAvg,
        autoAdjusted: true,
        metadata: JSON.stringify({
          recommendationScore: usageScore.recommendationScore,
          burstBehavior: usageScore.burstBehavior,
        }),
      },
      include: {
        fromTier: true,
        toTier: true,
      },
    });

    // Send email notification
    await this.sendTierUpgradeNotification({
      tenantId: tenant.id,
      tenantName: tenant.name,
      fromTier: tenant.subscriptionTier.name,
      toTier: nextTier.name,
      reason: "auto_upgrade",
    });

    logger.info(`Auto-upgraded tenant ${tenant.id} from ${tenant.subscriptionTier.name} to ${nextTier.name}`, {
      tenantId: tenant.id,
      fromTier: tenant.subscriptionTier.name,
      toTier: nextTier.name,
      violationFreeDays: usageScore.violationFreeDays,
      recommendationScore: usageScore.recommendationScore,
    } as any);

    return {
      tenantId: tenant.id,
      fromTier: tenant.subscriptionTier.name,
      toTier: nextTier.name,
      reason: "auto_upgrade",
      violationFreeDays: usageScore.violationFreeDays,
      avgUsageScore: usageScore.thirtyDayAvg,
      autoAdjusted: true,
    };
  }

  /**
   * Perform tier downgrade
   */
  private async performTierDowngrade(tenant: any, usageScore: UsageScoreResult): Promise<TierAdjustmentResult> {
    const currentTierIndex = this.tierHierarchy.indexOf(toTierCode(tenant.subscriptionTier.name));
    const previousTierCode = this.tierHierarchy[currentTierIndex - 1];

    const previousTier = await prisma.subscriptionTier.findFirst({
      where: { name: previousTierCode },
    });

    if (!previousTier) {
      throw new Error(`Previous tier ${previousTierCode} not found`);
    }

    // Update tenant's subscription tier
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { subscriptionTierId: previousTier.id },
    });

    // Record the adjustment
    const adjustment = await prisma.tierAdjustment.create({
      data: {
        tenantId: tenant.id,
        fromTierId: tenant.subscriptionTier.id,
        toTierId: previousTier.id,
        reason: "violation_demotion",
        violationFreeDays: usageScore.violationFreeDays,
        avgUsageScore: usageScore.thirtyDayAvg,
        autoAdjusted: true,
        metadata: JSON.stringify({
          recommendationScore: usageScore.recommendationScore,
          burstBehavior: usageScore.burstBehavior,
        }),
      },
      include: {
        fromTier: true,
        toTier: true,
      },
    });

    logger.info(`Auto-downgraded tenant ${tenant.id} from ${tenant.subscriptionTier.name} to ${previousTier.name}`, {
      tenantId: tenant.id,
      fromTier: tenant.subscriptionTier.name,
      toTier: previousTier.name,
      violationFreeDays: usageScore.violationFreeDays,
      burstBehavior: usageScore.burstBehavior,
    } as any);

    return {
      tenantId: tenant.id,
      fromTier: tenant.subscriptionTier.name,
      toTier: previousTier.name,
      reason: "violation_demotion",
      violationFreeDays: usageScore.violationFreeDays,
      avgUsageScore: usageScore.thirtyDayAvg,
      autoAdjusted: true,
    };
  }

  /**
   * Admin override to manually adjust tenant tier
   */
  async adminOverrideTierAdjustment(
    tenantId: string,
    targetTierName: string,
    adminUserId: string,
    reason: string = "admin_override"
  ): Promise<TierAdjustmentResult> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { subscriptionTier: true },
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const targetTier = await prisma.subscriptionTier.findFirst({
      where: { name: targetTierName },
    });

    if (!targetTier) {
      throw new Error(`Target tier ${targetTierName} not found`);
    }

    const usageScore = await this.usageTracker.getUsageScore(tenantId);

    // Update tenant's subscription tier
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { subscriptionTierId: targetTier.id },
    });

    // Record the adjustment
    const adjustment = await prisma.tierAdjustment.create({
      data: {
        tenantId,
        fromTierId: tenant.subscriptionTier.id,
        toTierId: targetTier.id,
        reason,
        violationFreeDays: usageScore.violationFreeDays,
        avgUsageScore: usageScore.thirtyDayAvg,
        autoAdjusted: false,
        adjustedBy: adminUserId,
        metadata: JSON.stringify({
          adminReason: reason,
          recommendationScore: usageScore.recommendationScore,
          burstBehavior: usageScore.burstBehavior,
        }),
      },
      include: {
        fromTier: true,
        toTier: true,
      },
    });

    logger.info(`Admin override: adjusted tenant ${tenantId} from ${tenant.subscriptionTier.name} to ${targetTier.name}`, {
      tenantId,
      fromTier: tenant.subscriptionTier.name,
      toTier: targetTier.name,
      adminUserId,
      reason,
    } as any);

    return {
      tenantId,
      fromTier: tenant.subscriptionTier.name,
      toTier: targetTier.name,
      reason: reason as any,
      violationFreeDays: usageScore.violationFreeDays,
      avgUsageScore: usageScore.thirtyDayAvg,
      autoAdjusted: false,
      adjustedBy: adminUserId,
    };
  }

  /**
   * Send email notification for tier upgrade
   */
  private async sendTierUpgradeNotification(data: EmailNotificationData): Promise<void> {
    try {
      // This would integrate with your existing email service
      // For now, we'll just log it
      logger.info("Tier upgrade notification sent", {
        tenantId: data.tenantId,
        tenantName: data.tenantName,
        fromTier: data.fromTier,
        toTier: data.toTier,
      } as any);

      // TODO: Integrate with existing email service
      // You might have an email service in the codebase already

    } catch (error) {
      logger.error("Failed to send tier upgrade notification", {
        tenantId: data.tenantId,
        error: error instanceof Error ? error.message : String(error)
      } as any);
    }
  }

  /**
   * Get tier adjustment history for a tenant
   */
  async getTierAdjustmentHistory(tenantId: string): Promise<any[]> {
    return await prisma.tierAdjustment.findMany({
      where: { tenantId },
      include: {
        fromTier: true,
        toTier: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all pending upgrade candidates
   */
  async getUpgradeCandidates(): Promise<UsageScoreResult[]> {
    return await this.usageTracker.getUpgradeCandidates(80);
  }
}
