import { createLogger } from "../utils/logger";

export abstract class BaseWorker {
  protected isShuttingDown: boolean = false;
  protected currentPromise: Promise<void> | null = null;
  protected logger = createLogger({ component: this.constructor.name });

  /**
   * Start the worker.
   */
  abstract start(): void;

  /**
   * Stop the worker gracefully, waiting for the current cycle to complete.
   */
  async stop(): Promise<void> {
    this.isShuttingDown = true;
    this.logger.info("Stopping worker...");

    this.clearScheduledTasks();

    if (this.currentPromise) {
      this.logger.info("Waiting for current execution cycle to complete...");
      await this.currentPromise;
    }

    this.logger.info("Worker stopped");
  }

  /**
   * Clear any intervals, timeouts, or cron tasks.
   */
  protected abstract clearScheduledTasks(): void;

  /**
   * Wrapper for running a cycle of work.
   * Ensures only one cycle runs at a time and tracks the promise for graceful shutdown.
   */
  protected async runCycle(workFn: () => Promise<void>): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.debug("Skipping work cycle: shutting down");
      return;
    }

    if (this.currentPromise) {
      this.logger.warn("Previous cycle still running; skipping this run");
      return;
    }

    this.currentPromise = (async () => {
      try {
        await workFn();
      } catch (error) {
        this.logger.error({ error: String(error) }, "Worker cycle failed");
      }
    })();

    try {
      await this.currentPromise;
    } finally {
      this.currentPromise = null;
    }
  }
}
