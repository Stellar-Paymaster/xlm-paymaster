import { runAnomalyDetection } from "../services/anomalyDetection";
import { BaseWorker } from "./baseWorker";

class AnomalyDetectionWorker extends BaseWorker {
  private interval: NodeJS.Timeout | null = null;
  private readonly RUN_INTERVAL_MS = Number(process.env.ANOMALY_DETECTION_INTERVAL_MS) || 60 * 60 * 1000; // Default: 1 hour

  start(): void {
    if (this.interval) {
      this.logger.warn("Anomaly detection worker already running");
      return;
    }

    this.logger.info(
      { poll_interval_ms: this.RUN_INTERVAL_MS },
      "Starting anomaly detection worker"
    );

    // Run immediately on start
    void this.runCycle(() => this.runDetection());

    // Schedule periodic runs
    this.interval = setInterval(() => {
      void this.runCycle(() => this.runDetection());
    }, this.RUN_INTERVAL_MS);
  }

  protected clearScheduledTasks(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async runDetection(): Promise<void> {
    this.logger.info("Running anomaly detection");
    await runAnomalyDetection();
    this.logger.info("Anomaly detection completed successfully");
  }
}

export const anomalyDetectionWorker = new AnomalyDetectionWorker();

