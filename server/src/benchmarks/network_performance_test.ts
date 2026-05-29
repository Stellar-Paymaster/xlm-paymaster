import { performance } from "perf_hooks";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "network_performance_benchmark" });

interface BenchmarkResult {
  latencyMs: number;
  packetLossRate: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  successRate: number;
}

/**
 * This benchmark simulates a client interacting with the server under various 
 * network simulation settings.
 * 
 * Note: This script assumes the server is running locally on PORT 3000 
 * with network simulation enabled via environment variables.
 */
class NetworkPerformanceTester {
  private baseUrl = "http://localhost:3000";

  async runTest(latencyMs: number, packetLossRate: number, iterations: number = 50): Promise<BenchmarkResult> {
    logger.info({ latencyMs, packetLossRate, iterations }, "Starting network performance test");

    const responseTimes: number[] = [];
    let successfulRequests = 0;
    let failedRequests = 0;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        // We hit the health endpoint which is affected by the middleware
        const response = await fetch(`${this.baseUrl}/health`);
        const duration = performance.now() - start;
        
        if (response.ok) {
          successfulRequests++;
          responseTimes.push(duration);
        } else if (response.status === 503 || response.status === 504) {
          failedRequests++;
        } else {
          // Other errors not caused by our simulation (or maybe they are)
          failedRequests++;
        }
      } catch (error) {
        failedRequests++;
      }
    }

    responseTimes.sort((a, b) => a - b);
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;
    const p95ResponseTime = responseTimes.length > 0 
      ? responseTimes[Math.floor(responseTimes.length * 0.95)] 
      : 0;

    const result: BenchmarkResult = {
      latencyMs,
      packetLossRate,
      totalRequests: iterations,
      successfulRequests,
      failedRequests,
      avgResponseTime,
      p95ResponseTime,
      successRate: (successfulRequests / iterations) * 100,
    };

    logger.info(result, "Test completed");
    return result;
  }

  printReport(results: BenchmarkResult[]) {
    console.log("\n=== Network Latency Simulation Performance Report ===\n");
    console.log("| Latency (ms) | Loss Rate | Success Rate | Avg Resp (ms) | P95 Resp (ms) |");
    console.log("|--------------|-----------|--------------|---------------|---------------|");
    
    for (const res of results) {
      console.log(`| ${res.latencyMs.toString().padEnd(12)} | ${res.packetLossRate.toString().padEnd(9)} | ${res.successRate.toFixed(1)}%`.padEnd(30) + 
                  ` | ${res.avgResponseTime.toFixed(1).padEnd(13)} | ${res.p95ResponseTime.toFixed(1).padEnd(13)} |`);
    }
    console.log("\n");
  }
}

async function main() {
  const tester = new NetworkPerformanceTester();
  const results: BenchmarkResult[] = [];

  // We can't easily change server env vars from here if the server is already running,
  // so this script expects the user to have started the server with specific settings,
  // or it just measures whatever the current settings are.
  
  // However, for a "real" benchmark, we might want to run multiple passes.
  // Since we can't easily restart the server with different env vars programmatically 
  // without more complex setup, we'll just measure the current state.
  
  console.log("Measuring current server network conditions...");
  const current = await tester.runTest(
    Number(process.env.FLUID_NETWORK_LATENCY_MS || 0),
    Number(process.env.FLUID_NETWORK_PACKET_LOSS_RATE || 0)
  );
  
  tester.printReport([current]);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export { NetworkPerformanceTester, BenchmarkResult };
