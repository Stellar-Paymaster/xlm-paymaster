import * as StellarSdk from "@stellar/stellar-sdk";
import { Config } from "../config";
import {
  AlertService,
  resolveLowBalanceCheckIntervalMs,
  resolveLowBalanceThresholdXlm,
} from "../services/alertService";
import { BaseWorker } from "./baseWorker";

export class BalanceMonitor extends BaseWorker {
  private readonly server: StellarSdk.Horizon.Server;
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: Config,
    private readonly alertService: AlertService,
  ) {
    super();
    if (!config.horizonUrl) {
      throw new Error("Horizon URL is required for balance monitoring");
    }

    this.server = new StellarSdk.Horizon.Server(config.horizonUrl);
  }

  start(): void {
    const threshold = resolveLowBalanceThresholdXlm(
      this.config.alerting.lowBalanceThresholdXlm,
    );
    const checkIntervalMs = resolveLowBalanceCheckIntervalMs(
      this.config.alerting.checkIntervalMs,
    );
    this.logger.info(
      {
        poll_interval_ms: checkIntervalMs,
        threshold_xlm: threshold,
      },
      "Starting balance monitor worker",
    );

    void this.runCycle(() => this.checkBalances());
    this.intervalHandle = setInterval(() => {
      void this.runCycle(() => this.checkBalances());
    }, checkIntervalMs);
  }

  protected clearScheduledTasks(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async checkBalances(): Promise<void> {
    const threshold = resolveLowBalanceThresholdXlm(
      this.config.alerting.lowBalanceThresholdXlm,
    );
    if (threshold === undefined) {
      return;
    }

    for (const account of this.config.feePayerAccounts) {
      if (this.isShuttingDown) break;

      const balanceXlm = await this.getNativeBalance(account.publicKey);
      this.logger.debug(
        { account: account.publicKey, balance_xlm: balanceXlm },
        "Checked account balance",
      );

      if (balanceXlm < threshold) {
        const wasSent = await this.alertService.sendLowBalanceAlert({
          accountPublicKey: account.publicKey,
          balanceXlm,
          thresholdXlm: threshold,
          networkPassphrase: this.config.networkPassphrase,
          horizonUrl: this.config.horizonUrl,
          checkedAt: new Date(),
        });

        if (wasSent) {
          this.logger.warn(
            { account: account.publicKey, balance_xlm: balanceXlm },
            "Low balance alert sent",
          );
        }
      } else {
        this.alertService.markBalanceRecovered(account.publicKey);
      }
    }
  }

  private async getNativeBalance(publicKey: string): Promise<number> {
    const account = await this.server.loadAccount(publicKey);
    const nativeBalance = account.balances.find(
      (balance) => balance.asset_type === "native",
    );

    return nativeBalance ? Number.parseFloat(nativeBalance.balance) : 0;
  }
}


let balanceMonitor: BalanceMonitor | null = null;

export function initializeBalanceMonitor(
  config: Config,
  alertService: AlertService,
): BalanceMonitor {
  if (balanceMonitor) {
    balanceMonitor.stop();
  }

  balanceMonitor = new BalanceMonitor(config, alertService);
  return balanceMonitor;
}

export function getBalanceMonitor(): BalanceMonitor | null {
  return balanceMonitor;
}
