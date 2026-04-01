import prisma from "../utils/db";
import { Config } from "../config";
import { AlertService } from "../services/alertService";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "bridge_monitor" });

export class BridgeMonitor {
  private intervalHandle: NodeJS.Timeout | null = null;
  private readonly checkIntervalMs = 60000; // 60 seconds

  constructor(
    private readonly config: Config,
    private readonly alertService: AlertService,
  ) {}

  start(): void {
    logger.info("Starting bridge monitor worker (60s interval)");
    void this.checkStalledSettlements();
    this.intervalHandle = setInterval(() => {
      void this.checkStalledSettlements();
    }, this.checkIntervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info("Stopped bridge monitor worker");
    }
  }

  async checkStalledSettlements(): Promise<void> {
    try {
      const now = new Date();
      
      // Find pending settlements that have timed out
      const stalledSettlements = await prisma.crossChainSettlement.findMany({
        where: {
          status: "PENDING",
          timeoutAt: {
            lt: now,
          },
        },
      });

      if (stalledSettlements.length === 0) {
        return;
      }

      logger.warn(`Found ${stalledSettlements.length} stalled cross-chain settlements`);

      for (const settlement of stalledSettlements) {
        // Update status to STALLED
        await prisma.crossChainSettlement.update({
          where: { id: settlement.id },
          data: { status: "STALLED" },
        });

        // Trigger alert
        await this.alertService.sendBridgeStallAlert({
          id: settlement.id,
          sourceChain: settlement.sourceChain,
          targetChain: settlement.targetChain,
          sourceTxHash: settlement.sourceTxHash,
          amount: settlement.amount.toString(),
          asset: settlement.asset,
          stalledAt: now,
        });

        logger.info({ settlementId: settlement.id }, "Settlement marked as STALLED and alert sent");
      }
    } catch (error) {
      logger.error({ error }, "Failed to check stalled bridge settlements");
    }
  }
}

let bridgeMonitor: BridgeMonitor | null = null;

export function initializeBridgeMonitor(
  config: Config,
  alertService: AlertService,
): BridgeMonitor {
  if (bridgeMonitor) {
    bridgeMonitor.stop();
  }

  bridgeMonitor = new BridgeMonitor(config, alertService);
  return bridgeMonitor;
}

export function getBridgeMonitor(): BridgeMonitor | null {
  return bridgeMonitor;
}
