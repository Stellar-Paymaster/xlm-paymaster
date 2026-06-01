import { purgeExpiredTenantErasures } from "../services/tenantErasure";
import { createLogger, serializeError } from "../utils/logger";
import { BaseWorker } from "./baseWorker";

const logger = createLogger({ component: "tenant_erasure_worker" });
const DEFAULT_CRON_SCHEDULE = "0 3 * * *";

export interface CronScheduler {
  schedule: (expression: string, callback: () => void) => { stop: () => void };
  validate: (expression: string) => boolean;
}

export interface TenantErasureWorkerOptions {
  cronSchedule?: string;
  enabled?: boolean;
  scheduler?: CronScheduler;
  purgeFn?: typeof purgeExpiredTenantErasures;
}

export class TenantErasureWorker extends BaseWorker {
  private task: { stop: () => void } | null = null;
  private readonly cronSchedule: string;
  private readonly enabled: boolean;
  private readonly scheduler: CronScheduler;
  private readonly purgeFn: typeof purgeExpiredTenantErasures;

  constructor(options: TenantErasureWorkerOptions = {}) {
    super();
    this.cronSchedule = options.cronSchedule ?? DEFAULT_CRON_SCHEDULE;
    this.enabled = options.enabled ?? true;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this.scheduler = options.scheduler ?? (require("node-cron") as CronScheduler);
    this.purgeFn = options.purgeFn ?? purgeExpiredTenantErasures;
  }

  start(): void {
    if (!this.enabled) {
      this.logger.info("Tenant erasure worker disabled (GDPR_ERASURE_ENABLED=false)");
      return;
    }

    if (!this.scheduler.validate(this.cronSchedule)) {
      this.logger.error(
        { schedule: this.cronSchedule },
        "Invalid GDPR_ERASURE_CRON_SCHEDULE; tenant erasure worker disabled",
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


  async runNow(): Promise<number> {
    try {
      const purgedCount = await this.purgeFn(new Date());
      logger.info({ purgedCount }, "Tenant erasure cleanup cycle complete");
      return purgedCount;
    } catch (error) {
      logger.error(
        { ...serializeError(error) },
        "Tenant erasure cleanup cycle failed",
      );
      throw error;
    }
  }
}

let tenantErasureWorker: TenantErasureWorker | null = null;

export function initializeTenantErasureWorker(
  options: TenantErasureWorkerOptions = {},
): TenantErasureWorker {
  const cronSchedule =
    process.env.GDPR_ERASURE_CRON_SCHEDULE?.trim() ?? DEFAULT_CRON_SCHEDULE;
  const enabled = process.env.GDPR_ERASURE_ENABLED !== "false";

  if (tenantErasureWorker) {
    tenantErasureWorker.stop();
  }

  tenantErasureWorker = new TenantErasureWorker({
    ...options,
    cronSchedule,
    enabled,
  });

  return tenantErasureWorker;
}

export function getTenantErasureWorker(): TenantErasureWorker | null {
  return tenantErasureWorker;
}
