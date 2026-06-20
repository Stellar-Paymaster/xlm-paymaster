import * as fs from "fs";
import * as os from "os";

import { createLogger, serializeError } from "../utils/logger";

import { nativeSigner } from "../signing/native";
import { performance } from "perf_hooks";

const logger = createLogger({ component: "simple_benchmark" });

interface BenchmarkResult {
  configuration: string;
  workerThreads: number;
  maxBlockingThreads: number;
  stackSize: number;
  requestsPerSecond: number;
  averageLatency: number;
  successRate: number;
  totalRequests: number;
  duration: number;
}

class SimpleBenchmark {
  private secretKey = process.env.PAYMASTER_FEE_PAYER_SECRET ?? "";
  private testPayload = Buffer.alloc(100, 1);

  async runSingleBenchmark (
    name: string,
    workerThreads: number,
    maxBlockingThreads: number,
    stackSize: number,
    duration: number = 30,
  ): Promise<BenchmarkResult> {
    logger.info(
      {
        duration_seconds: duration,
        max_blocking_threads: maxBlockingThreads,
        name,
        stack_size_mb: stackSize / 1024 / 1024,
        worker_threads: workerThreads,
      },
      "Running benchmark"
    );

    // Set environment variables for Rust runtime
    process.env.PAYMASTER_TOKIO_WORKER_THREADS = workerThreads.toString();
    process.env.PAYMASTER_TOKIO_MAX_BLOCKING_THREADS =
      maxBlockingThreads.toString();
    process.env.PAYMASTER_TOKIO_STACK_SIZE = stackSize.toString();

    const startTime = performance.now();
    const endTime = startTime + duration * 1000;

    let totalRequests = 0;
    let successfulRequests = 0;
    const latencies: number[] = [];

    // Warm up
    try {
      await nativeSigner.signPayload(this.secretKey, this.testPayload);
    } catch (error) {
      logger.error({ ...serializeError(error), benchmark_name: name }, "Benchmark warm up failed");
      throw error;
    }

    // Main benchmark loop
    while (performance.now() < endTime) {
      try {
        const requestStart = performance.now();
        await nativeSigner.signPayload(this.secretKey, this.testPayload);
        const latency = performance.now() - requestStart;

        latencies.push(latency);
        successfulRequests++;
      } catch (error) {
        // Count as failed request
      }
      totalRequests++;
    }

    const actualDuration = (performance.now() - startTime) / 1000;
    const requestsPerSecond = totalRequests / actualDuration;
    const successRate = (successfulRequests / totalRequests) * 100;
    const averageLatency =
      latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;

    logger.info(
      {
        average_latency_ms: averageLatency,
        benchmark_name: name,
        requests_per_second: requestsPerSecond,
        success_rate: successRate,
      },
      "Benchmark completed"
    );

    return {
      configuration: name,
      workerThreads,
      maxBlockingThreads,
      stackSize,
      requestsPerSecond,
      averageLatency,
      successRate,
      totalRequests,
      duration: actualDuration,
    };
  }

  generateReport (results: BenchmarkResult[]): string {
    let report = "# Tokio Runtime Performance Report\n\n";
    report += `Generated: ${new Date().toISOString()}\n`;
    report += `System: ${os.cpus().length} CPU cores\n\n`;

    report += "## Results Summary\n\n";
    report +=
      "| Configuration | Worker Threads | Max Blocking | Stack (MB) | RPS | Success Rate | Avg Latency (ms) |\n";
    report +=
      "|---------------|----------------|--------------|-----------|-----|--------------|------------------|\n";

    for (const result of results) {
      report += `| ${result.configuration} | ${result.workerThreads} | ${result.maxBlockingThreads} | ${result.stackSize / 1024 / 1024} | ${result.requestsPerSecond.toFixed(2)} | ${result.successRate.toFixed(2)}% | ${result.averageLatency.toFixed(2)} |\n`;
    }

    // Find best performing configuration
    const bestRPS = Math.max(...results.map((r) => r.requestsPerSecond));
    const bestConfig = results.find((r) => r.requestsPerSecond === bestRPS);

    if (bestConfig) {
      report += "\n## 🏆 Best Performance\n\n";
      report += `**${bestConfig.configuration}** achieved **${bestRPS.toFixed(2)} RPS**\n\n`;
      report += `- Worker threads: ${bestConfig.workerThreads}\n`;
      report += `- Max blocking threads: ${bestConfig.maxBlockingThreads}\n`;
      report += `- Stack size: ${bestConfig.stackSize / 1024 / 1024}MB\n`;
      report += `- Average latency: ${bestConfig.averageLatency.toFixed(2)}ms\n`;
      report += `- Success rate: ${bestConfig.successRate.toFixed(2)}%\n`;
    }

    // Target achievement
    report += "\n## Target Achievement\n\n";
    if (bestRPS >= 1000) {
      report += `✅ **SUCCESS**: Achieved ${bestRPS.toFixed(2)} RPS (target: 1000 RPS)\n`;
    } else {
      report += `❌ **FAILED**: Only achieved ${bestRPS.toFixed(2)} RPS (target: 1000 RPS)\n`;
    }

    report += "\n## Detailed Results\n\n";
    for (const result of results) {
      report += `### ${result.configuration}\n\n`;
      report += `- **Total requests**: ${result.totalRequests}\n`;
      report += `- **Duration**: ${result.duration.toFixed(2)}s\n`;
      report += `- **Requests per second**: ${result.requestsPerSecond.toFixed(2)}\n`;
      report += `- **Success rate**: ${result.successRate.toFixed(2)}%\n`;
      report += `- **Average latency**: ${result.averageLatency.toFixed(2)}ms\n`;
      report += "\n";
    }

    return report;
  }
}

async function runBenchmarks (): Promise<void> {
  const benchmark = new SimpleBenchmark();
  const results: BenchmarkResult[] = [];

  const numCores = os.cpus().length;

  // Test configurations
  const configs = [
    {
      name: "baseline_default",
      workerThreads: 1,
      maxBlockingThreads: 4,
      stackSize: 2 * 1024 * 1024,
    },
    {
      name: "optimized_num_cores",
      workerThreads: numCores,
      maxBlockingThreads: numCores * 4,
      stackSize: 2 * 1024 * 1024,
    },
    {
      name: "high_concurrency",
      workerThreads: numCores * 2,
      maxBlockingThreads: numCores * 8,
      stackSize: 4 * 1024 * 1024,
    },
    {
      name: "large_stack",
      workerThreads: numCores,
      maxBlockingThreads: numCores * 4,
      stackSize: 8 * 1024 * 1024,
    },
    {
      name: "max_performance",
      workerThreads: numCores * 4,
      maxBlockingThreads: numCores * 16,
      stackSize: 4 * 1024 * 1024,
    },
  ];

  logger.info({ cpu_cores: numCores }, "Starting Tokio runtime performance benchmarks");

  for (const config of configs) {
    try {
      const result = await benchmark.runSingleBenchmark(
        config.name,
        config.workerThreads,
        config.maxBlockingThreads,
        config.stackSize,
      );
      results.push(result);
    } catch (error) {
      logger.error(
        { ...serializeError(error), benchmark_name: config.name },
        "Benchmark execution failed"
      );
    }
  }

  if (results.length > 0) {
    const report = benchmark.generateReport(results);
    fs.writeFileSync("tokio_performance_report.md", report);
    logger.info({ report_path: "tokio_performance_report.md" }, "Performance report saved");

    // Show summary
    const bestRPS = Math.max(...results.map((r) => r.requestsPerSecond));
    logger.info({ best_requests_per_second: bestRPS }, "Best benchmark performance");

    if (bestRPS >= 1000) {
      logger.info({ best_requests_per_second: bestRPS, target_rps: 1000 }, "Benchmark target achieved");
    } else {
      logger.warn({ best_requests_per_second: bestRPS, target_rps: 1000 }, "Benchmark target not achieved");
    }
  } else {
    logger.warn("No benchmarks completed successfully");
  }
}

if (require.main === module) {
  runBenchmarks().catch((error) => {
    logger.error({ ...serializeError(error) }, "Benchmark run failed");
    process.exitCode = 1;
  });
}

export { BenchmarkResult, SimpleBenchmark };
