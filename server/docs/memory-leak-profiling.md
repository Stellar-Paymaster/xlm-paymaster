# Node.js Memory Leak Profiling

## Overview
As part of the professional-grade hardening & reliability standards, memory leak profiling has been implemented for long-running services in the `fluid` platform, specifically targeting the Ledger Monitor service.

## Features
- **Periodic Heap Snapshots**: Automatically triggers a `v8` heap snapshot at configurable intervals.
- **Memory Statistics Logging**: Logs current RSS, Heap Total, Heap Used, and External memory allocation periodically.
- **Automatic Cleanup**: Rotates and manages stored heap snapshots to prevent unbounded disk space consumption (keeps the latest 5 snapshots).
- **Graceful Lifecycle Management**: The `MemoryProfiler` class attaches to the service startup and shutdown phases to ensure clean profiling operations.

## Configuration
Memory profiling can be configured using environment variables that are consumed by the `WorkerConfig` section. 

| Environment Variable | Default | Description |
|----------------------|---------|-------------|
| `FLUID_MEMORY_PROFILING_ENABLED` | `false` | Set to `true` to enable memory leak profiling for workers. |
| `FLUID_MEMORY_PROFILING_LOG_INTERVAL_MS` | `60000` (1m) | The interval in milliseconds at which basic memory stats (rss, heap) are logged. |
| `FLUID_MEMORY_PROFILING_SNAPSHOT_INTERVAL_MS` | `3600000` (1h) | The interval in milliseconds at which a `.heapsnapshot` is written to disk. |
| `FLUID_MEMORY_PROFILING_SNAPSHOT_PATH` | `./snapshots` | Absolute or relative path to store heap snapshots. |

## Heap Snapshots
When enabled, heap snapshots are written as `.heapsnapshot` files. These files can be loaded into Chrome DevTools (Memory tab) or other Node.js memory analysis tools to inspect object retention and identify exact leak sources.

### Locating Snapshots
By default, the snapshots will be written to the `snapshots` directory in the current working directory of the application:
```bash
./snapshots/snapshot-<timestamp>.heapsnapshot
```

### Analysis Workflow
1. Download or locate the `.heapsnapshot` file.
2. Open Chrome DevTools and navigate to the **Memory** panel.
3. Click **Load** and select the `.heapsnapshot` file.
4. Use the **Comparison** view between subsequent snapshots to find growing object counts and retained sizes.
