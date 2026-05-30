import { Config } from "../config";
import {
  TreasurySwapService,
  TreasurySwapConfig,
  loadTreasurySwapConfig,
} from "../services/treasurySwap";
import { createLogger, serializeError } from "../utils/logger";
import { BaseWorker } from "./baseWorker";

const logger = createLogger({ component: "treasury_refill" });

const CHECK_INTERVAL_MS = parseInt(
  process.env.TREASURY_REFILL_CHECK_INTERVAL_MS || "300000",
  10
);

export class TreasuryRefillWorker extends BaseWorker {
  private intervalHandle: NodeJS.Timeout | null = null;
  private readonly swapService: TreasurySwapService;

  constructor(
    private readonly config: Config,
    private readonly swapConfig: TreasurySwapConfig
  ) {
    super();
    this.swapService = new TreasurySwapService(swapConfig);
  }

  start(): void {
    this.logger.info(
      {
        check_interval_ms: CHECK_INTERVAL_MS,
        swap_threshold: this.swapConfig.swapThreshold,
        asset: `${this.swapConfig.swapFromAssetCode}:${this.swapConfig.swapFromAssetIssuer}`,
        max_slippage: `${this.swapConfig.maxSlippagePercent}%`,
      },
      "Starting treasury refill worker"
    );

    void this.runCycle(() => this.checkAndRefill());
    this.intervalHandle = setInterval(() => {
      void this.runCycle(() => this.checkAndRefill());
    }, CHECK_INTERVAL_MS);
  }

  protected clearScheduledTasks(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }


  async checkAndRefill(): Promise<void> {
    try {
      for (const account of this.config.feePayerAccounts) {
        const assetBalance = await this.swapService.getAssetBalance(account.publicKey);
        const nativeBalance = await this.swapService.getNativeBalance(account.publicKey);

        logger.info(
          {
            account: account.publicKey,
            asset_balance: assetBalance,
            native_balance: nativeBalance,
            threshold: this.swapConfig.swapThreshold,
          },
          "Checking fee payer balances for treasury refill"
        );

        if (this.swapService.shouldSwap(assetBalance)) {
          logger.info(
            {
              account: account.publicKey,
              asset_balance: assetBalance,
              asset: this.swapConfig.swapFromAssetCode,
            },
            "Non-native balance exceeds threshold, initiating swap"
          );

          try {
            const result = await this.swapService.executeSwap(
              account.keypair,
              assetBalance.toFixed(7)
            );

            const newNativeBalance = await this.swapService.getNativeBalance(account.publicKey);

            logger.info(
              {
                tx_hash: result.txHash,
                account: account.publicKey,
                swapped_amount: result.amountIn,
                asset: result.assetCode,
                new_native_balance: newNativeBalance,
              },
              "Treasury refill swap completed"
            );
          } catch (swapError) {
            logger.error(
              {
                ...serializeError(swapError),
                account: account.publicKey,
                asset_balance: assetBalance,
              },
              "Treasury swap failed for account"
            );
          }
        }
      }
    } catch (error) {
      logger.error(
        { ...serializeError(error) },
        "Treasury refill check failed"
      );
    }
  }
}

let treasuryRefillWorker: TreasuryRefillWorker | null = null;

export function initializeTreasuryRefill(config: Config): TreasuryRefillWorker | null {
  const swapConfig = loadTreasurySwapConfig();
  if (!swapConfig) {
    logger.info("Treasury refill disabled — missing required configuration");
    return null;
  }

  if (treasuryRefillWorker) {
    treasuryRefillWorker.stop();
  }

  treasuryRefillWorker = new TreasuryRefillWorker(config, swapConfig);
  return treasuryRefillWorker;
}

export function getTreasuryRefillWorker(): TreasuryRefillWorker | null {
  return treasuryRefillWorker;
}
