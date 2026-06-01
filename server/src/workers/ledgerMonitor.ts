import { TransactionRecord, transactionStore } from "./transactionStore";
import { createLogger, serializeError } from "../utils/logger";

import type { Config } from "../config";
import { HorizonFailoverClient } from "../horizon/failoverClient";
import type { SlackNotifierLike } from "../services/slackNotifier";
import { WebhookService } from "../services/webhook";
import { MemoryProfiler } from "../utils/memoryProfiler";
import { BaseWorker } from "./baseWorker";

const logger = createLogger({ component: "ledger_monitor" });

export class LedgerMonitor extends BaseWorker {
  private readonly client: HorizonFailoverClient;
  private readonly webhookService: WebhookService;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 30000;
  private readonly batchSize: number;
  private memoryProfiler?: MemoryProfiler;

  constructor(
    config: Config,
    webhookService: WebhookService,
    private readonly slackNotifier?: SlackNotifierLike,
    client?: HorizonFailoverClient,
  ) {
    super();
    if (config.horizonUrls.length === 0) {
      throw new Error(
        "At least one Horizon URL is required for ledger monitoring",
      );
    }

    this.client = client || HorizonFailoverClient.fromConfig(config);
    this.webhookService = webhookService;
    this.batchSize = config.workers?.ledgerMonitorConcurrency ?? 5;
    
    if (config.workers?.memoryProfiling) {
      this.memoryProfiler = new MemoryProfiler(config.workers.memoryProfiling);
    }
  }

  start(): void {
    this.logger.info(
      { poll_interval_ms: this.POLL_INTERVAL_MS },
      "Starting ledger monitor worker",
    );
    void this.runCycle(() => this.checkPendingTransactions());

    this.pollInterval = setInterval(() => {
      void this.runCycle(() => this.checkPendingTransactions());
    }, this.POLL_INTERVAL_MS);

    this.memoryProfiler?.start();
  }

  protected clearScheduledTasks(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.memoryProfiler?.stop();
  }

  getNodeStatuses() {
    return this.client.getNodeStatuses();
  }

  private async checkPendingTransactions(): Promise<void> {
    try {
      this.logger.debug("Checking pending transactions");

      const pendingTransactions = transactionStore.getPendingTransactions();
      if (pendingTransactions.length === 0) {
        this.logger.debug("No pending transactions to check");
        return;
      }

      this.logger.info(
        {
          ledger_monitor_concurrency: this.batchSize,
          pending_transactions: pendingTransactions.length,
        },
        "Processing pending transactions",
      );

      for (let i = 0; i < pendingTransactions.length; i += this.batchSize) {
        if (this.isShuttingDown) {
          this.logger.info("Shutdown signal received; aborting batch processing");
          break;
        }

        const batch = pendingTransactions.slice(i, i + this.batchSize);
        await Promise.all(batch.map((tx) => this.checkTransaction(tx)));

        if (i + this.batchSize < pendingTransactions.length) {
          await this.delay(1000);
        }
      }
    } catch (error) {
      this.logger.error(
        { ...serializeError(error) },
        "Error checking pending transactions",
      );
    }
  }

  private async checkTransaction(
    transaction: TransactionRecord,
  ): Promise<void> {
    try {
      this.logger.debug(
        {
          status: transaction.status,
          tenant_id: transaction.tenantId,
          tx_hash: transaction.hash,
        },
        "Checking transaction status",
      );

      const txRecord = await this.client.getTransaction(transaction.hash);

      if (txRecord.successful) {
        this.logger.info(
          { tenant_id: transaction.tenantId, tx_hash: transaction.hash },
          "Transaction confirmed successfully",
        );
        transactionStore.updateTransactionStatus(transaction.hash, "success");
        await this.webhookService.dispatch(
          transaction.tenantId,
          transaction.hash,
          "success",
        );
      } else {
        this.logger.warn(
          { tenant_id: transaction.tenantId, tx_hash: transaction.hash },
          "Transaction confirmed unsuccessfully",
        );
        transactionStore.updateTransactionStatus(transaction.hash, "failed");
        await this.webhookService.dispatch(
          transaction.tenantId,
          transaction.hash,
          "failed",
        );
        await this.notifyFailedTransaction(
          transaction,
          "Horizon confirmed the transaction but marked it unsuccessful.",
        );
      }
    } catch (error: any) {
      if (error.response?.status === 404 || error.message?.includes("404")) {
        this.logger.warn(
          { tenant_id: transaction.tenantId, tx_hash: transaction.hash },
          "Transaction not found on ledger; marking as failed",
        );
        transactionStore.updateTransactionStatus(transaction.hash, "failed");
        await this.webhookService.dispatch(
          transaction.tenantId,
          transaction.hash,
          "failed",
        );
        await this.notifyFailedTransaction(
          transaction,
          "Transaction was not found on Horizon and has been marked as failed.",
        );
      } else {
        this.logger.error(
          {
            ...serializeError(error),
            tenant_id: transaction.tenantId,
            tx_hash: transaction.hash,
          },
          "Error checking transaction status",
        );
        if (
          transaction.hash.startsWith("test-") ||
          transaction.hash.length < 56
        ) {
          this.logger.warn(
            { tenant_id: transaction.tenantId, tx_hash: transaction.hash },
            "Test or invalid transaction detected; marking as failed",
          );
          transactionStore.updateTransactionStatus(transaction.hash, "failed");
          await this.webhookService.dispatch(
            transaction.tenantId,
            transaction.hash,
            "failed",
          );
          await this.notifyFailedTransaction(
            transaction,
            "Transaction failed validation during monitoring and was marked as failed.",
          );
        }
      }
    }
  }

  private async notifyFailedTransaction(
    transaction: TransactionRecord,
    detail: string,
  ): Promise<void> {
    if (!this.slackNotifier) {
      return;
    }

    await this.slackNotifier.notifyFailedTransaction({
      detail,
      source: "ledger_monitor",
      tenantId: transaction.tenantId,
      timestamp: new Date(),
      transactionHash: transaction.hash,
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

let ledgerMonitor: LedgerMonitor | null = null;

export function initializeLedgerMonitor(
  config: Config,
  slackNotifier?: SlackNotifierLike,
  client?: HorizonFailoverClient,
): LedgerMonitor {
  if (ledgerMonitor) {
    logger.warn(
      "Ledger monitor already initialized; stopping previous instance",
    );
    ledgerMonitor.stop();
  }

  ledgerMonitor = new LedgerMonitor(
    config,
    new WebhookService(),
    slackNotifier,
    client,
  );
  return ledgerMonitor;
}

export function getLedgerMonitor(): LedgerMonitor | null {
  return ledgerMonitor;
}
