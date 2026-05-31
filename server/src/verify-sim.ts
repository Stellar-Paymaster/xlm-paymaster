import { networkSimulationMiddleware } from "./middleware/networkSimulation";
import { Config } from "./config";

const mockConfig = {
  networkSimulation: {
    enabled: true,
    latencyMs: 500,
    packetLossRate: 0.1,
  }
} as Config;

try {
  const middleware = networkSimulationMiddleware(mockConfig);
  console.log("✅ Network simulation middleware initialized successfully.");
} catch (error) {
  console.error("❌ Failed to initialize middleware:", error);
  process.exit(1);
}
