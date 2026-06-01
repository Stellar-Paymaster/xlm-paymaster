import { TreasuryRebalancer } from "../services/treasuryRebalancer";
import { AlertService } from "../services/alertService";
import { Config, loadConfig } from "../config";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "verify_wormhole" });

async function verify() {
  logger.info("Starting Wormhole integration verification...");

  // Mock environment variables for testing if not set
  process.env.WORMHOLE_NETWORK = "Testnet";
  process.env.WORMHOLE_RPC_EVM = "https://ethereum-goerli.publicnode.com";
  process.env.WORMHOLE_TREASURY_EVM_SECRET = "0x0000000000000000000000000000000000000000000000000000000000000001";
  process.env.WORMHOLE_USDC_EVM = "0x07865c6E87B9F70255377e024ace6630C1Eaa37F";
  process.env.WORMHOLE_USDC_STELLAR = "CCW89yR98_fake_stellar_usdc_id";
  process.env.WORMHOLE_REBALANCE_THRESHOLD_XLM = "100";

  const config = loadConfig();
  const rebalancer = new TreasuryRebalancer(config);
  
  const alertService = new AlertService(config.alerting, {} as any, {
    treasuryRebalancer: rebalancer
  });
  
  rebalancer.setAlertService(alertService);

  logger.info("Rebalancer and AlertService initialized successfully");

  // Simulate a low balance check
  const testAccount = "GCBD9O6GUCGEYPZ5M7LTSFNTL7XN5CSSTG4R27T6A4N6DDTYF4WJYT5V";
  const lowBalance = 40; // Below threshold of 100

  logger.info({ account: testAccount, balance: lowBalance }, "Simulating low balance trigger");
  
  // This will trigger the checkAndRebalance logic
  // In a real scenario, this would attempt to fetch EVM balance and initiate bridge
  // For verification, we just ensure it doesn't crash and logs appropriately
  try {
    await rebalancer.checkAndRebalance(testAccount, lowBalance);
    logger.info("Rebalance check executed without crashing");
  } catch (error: any) {
    logger.error({ error: error.message }, "Rebalance check failed");
  }

  logger.info("Verification complete");
}

verify().catch(err => {
  logger.error(err);
  process.exit(1);
});
