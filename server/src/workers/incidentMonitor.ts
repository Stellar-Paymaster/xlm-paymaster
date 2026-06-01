import * as StellarSdk from "@stellar/stellar-sdk";
import { Config } from "../config";
import redis from "../utils/redis";
import { createLogger, serializeError } from "../utils/logger";
import {
  PagerDutyNotifier,
  type PagerDutyEventType,
} from "../services/pagerDutyNotifier";
import type { FcmNotifierLike } from "../services/fcmNotifier";
import { BaseWorker } from "./baseWorker";

const logger = createLogger({ component: "incident_monitor" });

const DEFAULT_CHECK_INTERVAL_MS = 15000;
const HORIZON_TIMEOUT_MS = 5000;
const HORIZON_OUTAGE_THRESHOLD_MS = 60000;

const INCIDENT_PREFIX = "pagerduty:incident:";
const HORIZON_SINCE_KEY = `${INCIDENT_PREFIX}horizon_unreachable:since`;

class IncidentStateStore {
  private readonly memory = new Map<string, string>();

  async getState(key: string): Promise<string | null> {
    try {
      const value = await redis.get(key);
      return value ?? null;
    } catch (error) {
      logger.warn(
        { ...serializeError(error), key },
        "Redis incident state read failed, using memory cache",
      );
      return this.memory.get(key) ?? null;
    }
  }

  async setState(key: string, value: string | null): Promise<void> {
    try {
      if (value === null) {
        await redis.del(key);
      } else {
        await redis.set(key, value);
      }
    } catch (error) {
      logger.warn(
        { ...serializeError(error), key },
        "Redis incident state write failed, using memory cache",
      );
      if (value === null) {
        this.memory.delete(key);
      } else {
        this.memory.set(key, value);
      }
    }
  }

  async isOpen(type: PagerDutyEventType): Promise<boolean> {
    const key = `${INCIDENT_PREFIX}${type}`;
    const state = await this.getState(key);
    return state === "open";
  }

  async setOpen(type: PagerDutyEventType, open: boolean): Promise<void> {
    const key = `${INCIDENT_PREFIX}${type}`;
    await this.setState(key, open ? "open" : null);
  }

  async getHorizonFailureSince(): Promise<number | null> {
    const value = await this.getState(HORIZON_SINCE_KEY);
    if (!value) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async setHorizonFailureSince(timestamp: number | null): Promise<void> {
    await this.setState(
      HORIZON_SINCE_KEY,
      timestamp === null ? null : String(timestamp),
    );
  }
}

export interface IncidentMonitorOptions {
  checkIntervalMs?: number;
  horizonCheck?: () => Promise<boolean>;
  fcmNotifier?: FcmNotifierLike;
}

export class IncidentMonitor extends BaseWorker {
  private intervalHandle: NodeJS.Timeout | null = null;
  private readonly horizonServer: StellarSdk.Horizon.Server | null;
  private readonly state = new IncidentStateStore();
  private restartPending = false;
  private readonly fcmNotifier?: FcmNotifierLike;

  constructor(
    private readonly config: Config,
    private readonly pagerDuty: PagerDutyNotifier,
    private readonly options: IncidentMonitorOptions = {},
  ) {
    super();
    this.horizonServer = config.horizonUrl
      ? new StellarSdk.Horizon.Server(config.horizonUrl)
      : null;
    this.fcmNotifier = options.fcmNotifier;
  }

  start(): void {
    const intervalMs =
      this.options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.logger.info(
      { interval_ms: intervalMs },
      "Starting incident monitor worker",
    );

    if (this.pagerDuty.isConfigured()) {
      this.restartPending = true;
      void this.triggerRestartIncident();
    }

    void this.runCycle(() => this.checkIncidents());
    this.intervalHandle = setInterval(() => {
      void this.runCycle(() => this.checkIncidents());
    }, intervalMs);
  }

  protected clearScheduledTasks(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }


  private async checkIncidents(): Promise<void> {
    try {
      await this.checkSignerPool();
      const horizonOk = await this.checkHorizon();

      if (this.restartPending && horizonOk && this.hasActiveSigners()) {
        await this.resolveIncident("server_restart", {
          summary: "Fluid server recovered after restart",
          severity: "info",
        });
        this.restartPending = false;
      }
    } catch (error) {
      logger.error(
        { ...serializeError(error) },
        "Incident monitor failed during check",
      );
    }
  }

  private hasActiveSigners(): boolean {
    return (
      this.config.signerPool
        .getSnapshot()
        .filter((account) => account.active).length > 0
    );
  }

  private async checkSignerPool(): Promise<void> {
    const activeCount = this.config.signerPool
      .getSnapshot()
      .filter((account) => account.active).length;

    if (activeCount === 0) {
      await this.triggerIncident("signer_pool_empty", {
        summary: "No usable signing accounts available",
        customDetails: {
          active_signers: activeCount,
        },
      });
      return;
    }

    await this.resolveIncident("signer_pool_empty", {
      summary: "Signing capacity restored",
      severity: "info",
      customDetails: {
        active_signers: activeCount,
      },
    });
  }

  private async checkHorizon(): Promise<boolean> {
    if (!this.horizonServer) {
      return true;
    }

    const horizonOk =
      (await (this.options.horizonCheck?.() ??
        this.checkHorizonServerInfo())) ?? false;

    const now = Date.now();
    if (horizonOk) {
      await this.state.setHorizonFailureSince(null);
      await this.resolveIncident("horizon_unreachable", {
        summary: "Horizon connectivity restored",
        severity: "info",
      });
      return true;
    }

    const since = (await this.state.getHorizonFailureSince()) ?? now;
    if (since === now) {
      await this.state.setHorizonFailureSince(now);
    }

    if (now - since >= HORIZON_OUTAGE_THRESHOLD_MS) {
      await this.triggerIncident("horizon_unreachable", {
        summary: "Horizon unreachable for over 60 seconds",
        customDetails: {
          horizon_url: this.config.horizonUrl ?? "not set",
          outage_seconds: Math.round((now - since) / 1000),
        },
      });
    }

    return false;
  }

  private async checkHorizonServerInfo(): Promise<boolean> {
    if (!this.horizonServer) {
      return true;
    }

    try {
      await withTimeout(
        this.horizonServer.feeStats(),
        HORIZON_TIMEOUT_MS,
      );
      return true;
    } catch (error) {
      logger.warn(
        { ...serializeError(error) },
        "Horizon connectivity check failed",
      );
      return false;
    }
  }

  private async triggerRestartIncident(): Promise<void> {
    await this.triggerIncident("server_restart", {
      summary: "Fluid server restarted",
      customDetails: {
        pid: process.pid,
      },
    });
  }

  private async triggerIncident(
    type: PagerDutyEventType,
    details: {
      summary: string;
      severity?: "critical" | "error" | "warning" | "info";
      customDetails?: Record<string, unknown>;
    },
  ): Promise<void> {
    // Send FCM push for critical server events regardless of PagerDuty config
    if (this.fcmNotifier?.isConfigured()) {
      void this.fcmNotifier.notifyServerDown({
        reason: details.summary,
        detail: details.customDetails
          ? JSON.stringify(details.customDetails)
          : undefined,
      });
    }

    if (!this.pagerDuty.isConfigured()) {
      return;
    }

    const alreadyOpen = await this.state.isOpen(type);
    if (alreadyOpen) {
      return;
    }

    const delivered = await this.pagerDuty.trigger(type, {
      summary: details.summary,
      severity: details.severity ?? "critical",
      customDetails: details.customDetails,
    });

    if (delivered) {
      await this.state.setOpen(type, true);
    }
  }

  private async resolveIncident(
    type: PagerDutyEventType,
    details: {
      summary: string;
      severity?: "critical" | "error" | "warning" | "info";
      customDetails?: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!this.pagerDuty.isConfigured()) {
      return;
    }

    const isOpen = await this.state.isOpen(type);
    if (!isOpen) {
      return;
    }

    const delivered = await this.pagerDuty.resolve(type, {
      summary: details.summary,
      severity: details.severity ?? "info",
      customDetails: details.customDetails,
    });

    if (delivered) {
      await this.state.setOpen(type, false);
    }
  }
}

export function initializeIncidentMonitor(
  config: Config,
  pagerDuty: PagerDutyNotifier,
  options: IncidentMonitorOptions = {},
  fcmNotifier?: FcmNotifierLike,
): IncidentMonitor {
  return new IncidentMonitor(config, pagerDuty, { ...options, fcmNotifier });
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}
