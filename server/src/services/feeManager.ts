import { Config } from "../config";
import { createLogger, serializeError } from "../utils/logger";

const logger = createLogger({ component: "fee_manager" });

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const LOW_MULTIPLIER = 1.0;
const HIGH_MULTIPLIER = 2.0;
const HIGH_CONGESTION_THRESHOLD = 4;

interface FeePercentiles {
  p70?: string;
  p95?: string;
}

interface FeeStatsResponse {
  fee_charged?: FeePercentiles;
  max_fee?: FeePercentiles;
}

export interface FeeManagerSnapshot {
  congestionLevel: "low" | "high";
  lastReason: string;
  multiplier: number;
  updatedAt: string;
}

class FeeManager {
  private readonly baseFee: number;

  private readonly horizonUrl?: string;

  private readonly intervalMs: number;

  private timer: NodeJS.Timeout | null = null;

  private snapshot: FeeManagerSnapshot;

  constructor(config: Config) {
    this.baseFee = Math.max(1, config.baseFee);
    this.horizonUrl = config.horizonUrl;
    this.intervalMs = Math.max(
      1_000,
      Number.parseInt(
        process.env.PAYMASTER_FEE_STATS_POLL_INTERVAL_MS ?? `${DEFAULT_POLL_INTERVAL_MS}`,
        10
      ) || DEFAULT_POLL_INTERVAL_MS
    );

    this.snapshot = {
      congestionLevel: "high",
      lastReason: "Initial startup value",
      multiplier: config.feeMultiplier,
      updatedAt: new Date().toISOString(),
    };
  }

  start(): void {
    if (!this.horizonUrl || this.timer) {
      return;
    }

    void this.pollOnce();

    this.timer = setInterval(() => {
      void this.pollOnce();
    }, this.intervalMs);

    logger.info(
      { horizon_url: this.horizonUrl, poll_interval_ms: this.intervalMs },
      "Dynamic fee multiplier polling started"
    );
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
    logger.info("Dynamic fee multiplier polling stopped");
  }

  getMultiplier(): number {
    return this.snapshot.multiplier;
  }

  getSnapshot(): FeeManagerSnapshot {
    return { ...this.snapshot };
  }

  async pollOnce(): Promise<void> {
    if (!this.horizonUrl) {
      return;
    }

    try {
      const response = await fetch(`${this.horizonUrl.replace(/\/$/, "")}/fee_stats`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        throw new Error(`Horizon fee_stats returned ${response.status}`);
      }

      const feeStats = (await response.json()) as FeeStatsResponse;
      const p70Raw = feeStats.fee_charged?.p70 ?? feeStats.max_fee?.p70;
      const p95Raw = feeStats.fee_charged?.p95 ?? feeStats.max_fee?.p95;

      const p70 = Number.parseInt(p70Raw ?? "", 10);
      const p95 = Number.parseInt(p95Raw ?? "", 10);

      if (!Number.isFinite(p70) || !Number.isFinite(p95)) {
        throw new Error("Missing p70/p95 values in Horizon fee_stats response");
      }

      const ratio = Math.max(p70, p95) / this.baseFee;
      const congestionLevel = ratio >= HIGH_CONGESTION_THRESHOLD ? "high" : "low";
      const nextMultiplier = congestionLevel === "high" ? HIGH_MULTIPLIER : LOW_MULTIPLIER;
      const reason = `p70=${p70}, p95=${p95}, baseFee=${this.baseFee}, ratio=${ratio.toFixed(2)}`;

      if (nextMultiplier !== this.snapshot.multiplier) {
        const previous = this.snapshot.multiplier;
        this.snapshot = {
          congestionLevel,
          lastReason: reason,
          multiplier: nextMultiplier,
          updatedAt: new Date().toISOString(),
        };

        logger.info(
          {
            previous_multiplier: previous,
            next_multiplier: nextMultiplier,
            congestion_level: congestionLevel,
            reason,
          },
          "Updated dynamic fee multiplier"
        );
        return;
      }

      this.snapshot = {
        ...this.snapshot,
        congestionLevel,
        lastReason: reason,
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.warn(
        { ...serializeError(error) },
        "Failed to refresh dynamic fee multiplier from Horizon"
      );
    }
  }
}

let manager: FeeManager | null = null;

export function initializeFeeManager(config: Config): FeeManager {
  if (manager) {
    return manager;
  }

  manager = new FeeManager(config);
  manager.start();
  return manager;
}

export function getFeeManager(): FeeManager | null {
  return manager;
}

export function resetFeeManagerForTests(): void {
  manager?.stop();
  manager = null;
}
