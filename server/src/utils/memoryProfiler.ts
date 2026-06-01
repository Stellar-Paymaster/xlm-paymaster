import v8 from "v8";
import fs from "fs";
import path from "path";
import { createLogger } from "./logger";

const logger = createLogger({ component: "memory_profiler" });

export interface MemoryStats {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

export class MemoryProfiler {
  private interval: NodeJS.Timeout | null = null;
  private lastSnapshotTime: number = 0;
  private readonly snapshotDir: string;

  constructor(
    private readonly options: {
      enabled: boolean;
      logIntervalMs: number;
      heapSnapshotIntervalMs: number;
      snapshotPath?: string;
    }
  ) {
    this.snapshotDir = options.snapshotPath || path.join(process.cwd(), "snapshots");
    if (this.options.enabled && !fs.existsSync(this.snapshotDir)) {
      fs.mkdirSync(this.snapshotDir, { recursive: true });
    }
  }

  start(): void {
    if (!this.options.enabled) {
      logger.info("Memory profiling is disabled");
      return;
    }

    logger.info(
      {
        logIntervalMs: this.options.logIntervalMs,
        heapSnapshotIntervalMs: this.options.heapSnapshotIntervalMs,
      },
      "Starting memory profiler"
    );

    this.interval = setInterval(() => {
      this.runProfilingCycle();
    }, this.options.logIntervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info("Stopped memory profiler");
    }
  }

  private runProfilingCycle(): void {
    const stats = this.getMemoryStats();
    logger.info({ memory: stats }, "Current memory usage");

    const now = Date.now();
    if (
      this.options.heapSnapshotIntervalMs > 0 &&
      now - this.lastSnapshotTime >= this.options.heapSnapshotIntervalMs
    ) {
      this.takeHeapSnapshot();
      this.lastSnapshotTime = now;
    }
  }

  getMemoryStats(): MemoryStats {
    const memoryUsage = process.memoryUsage();
    return {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      arrayBuffers: (memoryUsage as any).arrayBuffers || 0,
    };
  }

  takeHeapSnapshot(): string {
    const filename = `snapshot-${Date.now()}.heapsnapshot`;
    const fullPath = path.join(this.snapshotDir, filename);

    logger.info({ path: fullPath }, "Taking heap snapshot");

    try {
      v8.writeHeapSnapshot(fullPath);
      logger.info({ path: fullPath }, "Heap snapshot saved successfully");
      
      // Cleanup old snapshots (keep last 5)
      this.cleanupSnapshots();
      
      return fullPath;
    } catch (error) {
      logger.error({ error, path: fullPath }, "Failed to take heap snapshot");
      return "";
    }
  }

  private cleanupSnapshots(): void {
    try {
      const files = fs.readdirSync(this.snapshotDir)
        .filter(f => f.endsWith(".heapsnapshot"))
        .map(f => ({
          name: f,
          time: fs.statSync(path.join(this.snapshotDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 5) {
        files.slice(5).forEach(f => {
          fs.unlinkSync(path.join(this.snapshotDir, f.name));
          logger.debug({ file: f.name }, "Deleted old heap snapshot");
        });
      }
    } catch (error) {
      logger.warn({ error }, "Error cleaning up old heap snapshots");
    }
  }
}
