import { createLogger, serializeError } from "../utils/logger";
import {
  DigestService,
  resolveDigestEmailTransport,
  type DigestEmailTransport,
} from "../services/digestService";

const logger = createLogger({ component: "digest_worker" });

const DEFAULT_CRON_SCHEDULE = "0 8 * * *"; // 08:00 local every day

export interface CronScheduler {
  schedule: (expression: string, callback: () => void) => { stop: () => void };
  validate: (expression: string) => boolean;
}

export interface DigestWorkerOptions {
  cronSchedule?: string;
  enabled?: boolean;
  /** Injected in tests to avoid real DB / email calls */
  digestService?: DigestService;
  /** Injected in tests to avoid real node-cron calls */
  scheduler?: CronScheduler;
}

export class DigestWorker {
  private task: { stop: () => void } | null = null;
  private readonly cronSchedule: string;
  private readonly enabled: boolean;
  private readonly digestService: DigestService;
  private readonly scheduler: CronScheduler;

  constructor(
    emailTransport: DigestEmailTransport,
    options: DigestWorkerOptions = {},
  ) {
    this.cronSchedule = options.cronSchedule ?? DEFAULT_CRON_SCHEDULE;
    this.enabled = options.enabled ?? true;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this.scheduler = options.scheduler ?? (require("node-cron") as CronScheduler);
    this.digestService =
      options.digestService ??
      new DigestService({
        emailTransport,
        dashboardUrl:
          process.env.FLUID_ALERT_DASHBOARD_URL?.trim() ||
          process.env.DASHBOARD_URL?.trim() ||
          undefined,
        unsubscribeBaseUrl:
          process.env.REGISTRATION_VERIFY_BASE_URL?.trim() ||
          process.env.FLUID_ALERT_DASHBOARD_URL?.trim() ||
          undefined,
        unsubscribeSecret:
          process.env.DIGEST_UNSUBSCRIBE_SECRET?.trim() || "digest-unsubscribe",
      });
  }

  start(): void {
    if (!this.enabled) {
      logger.info("Daily digest worker disabled (DIGEST_ENABLED=false)");
      return;
    }

    if (!this.scheduler.validate(this.cronSchedule)) {
      logger.error(
        { schedule: this.cronSchedule },
        "Invalid DIGEST_CRON_SCHEDULE — daily digest disabled",
      );
      return;
    }

    logger.info(
      { schedule: this.cronSchedule },
      "Starting daily digest worker",
    );

    this.task = this.scheduler.schedule(this.cronSchedule, () => {
      void this.runNow();
    });
  }

  stop(): void {
    if (!this.task) return;
    this.task.stop();
    this.task = null;
    logger.info("Stopped daily digest worker");
  }

  /** Runs the digest immediately — useful for manual trigger / testing. */
  async runNow(alertsTriggered: string[] = []): Promise<void> {
    logger.info("Running daily digest now");
    try {
      await this.digestService.sendDigest(new Date(), alertsTriggered);
    } catch (error) {
      logger.error(
        { ...serializeError(error) },
        "Daily digest send failed",
      );
      throw error;
    }
  }
}

let digestWorker: DigestWorker | null = null;

export function initializeDigestWorker(
  options: DigestWorkerOptions = {},
): DigestWorker | null {
  const transport = resolveDigestEmailTransport();

  if (!transport) {
    logger.info(
      "No email transport configured — daily digest worker disabled. " +
        "Set RESEND_API_KEY/RESEND_EMAIL_FROM/RESEND_EMAIL_TO or SMTP env vars to enable.",
    );
    return null;
  }

  const cronSchedule =
    process.env.DIGEST_CRON_SCHEDULE?.trim() ?? DEFAULT_CRON_SCHEDULE;
  const enabled = process.env.DIGEST_ENABLED !== "false";

  if (digestWorker) {
    digestWorker.stop();
  }

  digestWorker = new DigestWorker(transport, {
    ...options,
    cronSchedule,
    enabled,
  });

  return digestWorker;
}

export function getDigestWorker(): DigestWorker | null {
  return digestWorker;
}
