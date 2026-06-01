import { BaseWorker } from "./baseWorker";
import { DatabaseRecoveryDrillsService } from "../services/databaseRecoveryDrills";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "database_recovery_drills_worker" });

export class DatabaseRecoveryDrillsWorker extends BaseWorker {
  private intervalHandle: NodeJS.Timeout | null = null;
  private drillService: DatabaseRecoveryDrillsService;

  constructor(drillService?: DatabaseRecoveryDrillsService) {
    super();
    this.drillService = drillService ?? new DatabaseRecoveryDrillsService();
  }

  start(): void {
    logger.info("Starting Database Recovery Drills Worker (running daily)...");
    this.intervalHandle = setInterval(() => {
      void this.runCycle(() => this.runDrill());
    }, 24 * 60 * 60 * 1000); // Run once a day
  }

  async runDrill(): Promise<void> {
    logger.info("Starting scheduled database recovery drill...");
    try {
      const report = await this.drillService.runDrill();
      if (report.status === "SUCCESS") {
        logger.info({ report }, "Database recovery drill completed successfully.");
      } else {
        logger.error({ report }, "Database recovery drill failed!");
      }
    } catch (err: any) {
      logger.error({ error: err.message }, "Database recovery drill worker encountered an error");
    }
  }

  protected clearScheduledTasks(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
