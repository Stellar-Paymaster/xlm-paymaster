/**
 * Nightly sandbox cleanup worker (#717)
 *
 * Runs a scheduled cycle that:
 *   1. Purges stale sandbox transaction data
 *   2. Auto-resets sandbox API keys older than the stale threshold
 */

import { autoResetStaleSandboxKeys } from "../handlers/sandbox";
import {
  purgeStaleSandboxTransactionData,
  type SandboxCleanupReport,
} from "../services/sandboxCleanup";
import { createLogger, serializeError } from "../utils/logger";
import { BaseWorker } from "./baseWorker";

const logger = createLogger({ component: "sandbox_cleanup_worker" });
const DEFAULT_CRON_SCHEDULE = "0 4 * * *";

export interface CronScheduler {
  schedule: (expression: string, callback: () => void) => { stop: () => void };
  validate: (expression: string) => boolean;
}

export interface SandboxCleanupWorkerOptions {
  cronSchedule?: string;
  enabled?: boolean;
  scheduler?: CronScheduler;
  purgeFn?: typeof purgeStaleSandboxTransactionData;
  resetFn?: typeof autoResetStaleSandboxKeys;
}

export interface SandboxCleanupCycleResult {
  purgeReport: SandboxCleanupReport;
  keysReset: number;
}

export class SandboxCleanupWorker extends BaseWorker {
  private task: { stop: () => void } | null = null;
  private readonly cronSchedule: string;
  private readonly enabled: boolean;
  private readonly scheduler: CronScheduler;
  private readonly purgeFn: typeof purgeStaleSandboxTransactionData;
  private readonly resetFn: typeof autoResetStaleSandboxKeys;

  constructor(options: SandboxCleanupWorkerOptions = {}) {
    super();
    this.cronSchedule = options.cronSchedule ?? DEFAULT_CRON_SCHEDULE;
    this.enabled = options.enabled ?? true;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this.scheduler = options.scheduler ?? (require("node-cron") as CronScheduler);
    this.purgeFn = options.purgeFn ?? purgeStaleSandboxTransactionData;
    this.resetFn = options.resetFn ?? autoResetStaleSandboxKeys;
  }

  start(): void {
    if (!this.enabled) {
      this.logger.info("Sandbox cleanup worker disabled (SANDBOX_CLEANUP_ENABLED=false)");
      return;
    }

    if (!this.scheduler.validate(this.cronSchedule)) {
      this.logger.error(
        { schedule: this.cronSchedule },
        "Invalid SANDBOX_CLEANUP_CRON_SCHEDULE; sandbox cleanup worker disabled",
      );
      return;
    }

    this.task = this.scheduler.schedule(this.cronSchedule, () => {
      void this.runCycle(() => this.runNow().then(() => {}));
    });
  }

  protected clearScheduledTasks(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
  }

  async runNow(): Promise<SandboxCleanupCycleResult> {
    try {
      const purgeReport = await this.purgeFn();
      const keysReset = await this.resetFn(new Date());

      logger.info(
        {
          transactionsDeleted: purgeReport.transactionsDeleted,
          keysReset,
          status: purgeReport.status,
        },
        "Sandbox cleanup cycle complete",
      );

      return { purgeReport, keysReset };
    } catch (error) {
      logger.error(
        { ...serializeError(error) },
        "Sandbox cleanup cycle failed",
      );
      throw error;
    }
  }
}

let sandboxCleanupWorker: SandboxCleanupWorker | null = null;

export function initializeSandboxCleanupWorker(
  options: SandboxCleanupWorkerOptions = {},
): SandboxCleanupWorker {
  const cronSchedule =
    process.env.SANDBOX_CLEANUP_CRON_SCHEDULE?.trim() ?? DEFAULT_CRON_SCHEDULE;
  const enabled = process.env.SANDBOX_CLEANUP_ENABLED !== "false";

  if (sandboxCleanupWorker) {
    sandboxCleanupWorker.stop();
  }

  sandboxCleanupWorker = new SandboxCleanupWorker({
    ...options,
    cronSchedule,
    enabled,
  });

  return sandboxCleanupWorker;
}

export function getSandboxCleanupWorker(): SandboxCleanupWorker | null {
  return sandboxCleanupWorker;
}
