import cron from "node-cron";
import { logger as globalLogger } from "../utils/logger";
import { TenantUsageTracker } from "../services/tenantUsageTracker";
import { IntelligentRateLimiter } from "../services/intelligentRateLimiter";
import { BaseWorker } from "./baseWorker";

export class DailyScoringWorker extends BaseWorker {
  private usageTracker: TenantUsageTracker;
  private rateLimiter: IntelligentRateLimiter;
  private task: cron.ScheduledTask | null = null;

  constructor() {
    super();
    this.usageTracker = new TenantUsageTracker();
    this.rateLimiter = new IntelligentRateLimiter();
  }

  /**
   * Start the daily scoring job
   * Runs every day at 2 AM UTC
   */
  start(): void {
    this.task = cron.schedule("0 2 * * *", () => {
      if (this.currentPromise) {
        this.logger.warn("Daily scoring job is already running, skipping");
        return;
      }

      void this.runCycle(() => this.runDailyScoring());
    }, {
      timezone: "UTC"
    });

    this.logger.info("Daily scoring worker started - scheduled to run daily at 2 AM UTC");
  }

  protected clearScheduledTasks(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
  }

  /**
   * Run the daily scoring job manually
   */
  async runDailyScoring(): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.info("Starting daily tenant scoring job");

      // Step 1: Update daily statistics for all tenants
      await this.usageTracker.updateDailyStats();
      this.logger.info("Daily statistics updated");

      // Step 2: Process intelligent rate limit adjustments
      const adjustments = await this.rateLimiter.processAutoAdjustments();
      this.logger.info(`Processed ${adjustments.length} tier adjustments`);

      // Step 3: Log summary
      const duration = Date.now() - startTime;
      this.logger.info(`Daily scoring job completed in ${duration}ms`, {
        adjustmentsProcessed: adjustments.length,
        duration
      } as any);

      // Create admin notification for summary
      if (adjustments.length > 0) {
        await this.createAdminSummary(adjustments);
      }

    } catch (error) {
      this.logger.error("Daily scoring job failed", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        duration: Date.now() - startTime
      } as any);
    }
  }

  /**
   * Create admin notification with job summary
   */
  private async createAdminSummary(adjustments: any[]): Promise<void> {
    try {
      const { createNotification } = await import("../services/notificationService");

      const upgrades = adjustments.filter(adj => adj.reason === "auto_upgrade");
      const downgrades = adjustments.filter(adj => adj.reason === "violation_demotion");

      let title = "Daily Rate Limit Adjustments";
      let message = `Processed ${adjustments.length} tier adjustments today.`;

      if (upgrades.length > 0) {
        message += `\n\n📈 Upgrades: ${upgrades.length} tenants upgraded to higher tiers.`;
      }

      if (downgrades.length > 0) {
        message += `\n\n📉 Downgrades: ${downgrades.length} tenants downgraded due to violations.`;
      }

      await createNotification({
        type: "info",
        title,
        message,
        metadata: {
          totalAdjustments: adjustments.length,
          upgrades: upgrades.length,
          downgrades: downgrades.length,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      this.logger.error("Failed to create admin summary notification", {
        error: error instanceof Error ? error.message : String(error)
      } as any);
    }
  }

  /**
   * Get worker status
   */
  getStatus(): { isRunning: boolean; lastRun?: Date } {
    return {
      isRunning: this.currentPromise !== null,
      // TODO: Add last run tracking if needed
    };
  }
}


// Export singleton instance
export const dailyScoringWorker = new DailyScoringWorker();
