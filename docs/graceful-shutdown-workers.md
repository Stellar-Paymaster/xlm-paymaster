# Graceful Shutdown for Workers

## Overview

The Fluid platform requires professional-grade hardening and reliability standards. To prevent partial writes and inconsistent state during deployments or unexpected terminations, the server implements a graceful shutdown mechanism for all background workers. 

This ensures that active intervals (e.g., Ledger Monitor cycles) are allowed to complete before the process exits.

## Worker Lifecycle Architecture

All workers extend the `BaseWorker` class, which provides standard lifecycle management.

### BaseWorker Class (`src/workers/baseWorker.ts`)

The `BaseWorker` abstract class handles:
1. **Shutdown Flag**: Maintains an `isShuttingDown` flag that workers can check to abort early or prevent new batches from starting.
2. **Promise Tracking**: Tracks the `currentPromise` of the active execution cycle.
3. **Graceful Wait**: Implements an async `stop()` method that clears scheduled tasks and awaits `currentPromise`.
4. **Execution Wrapper**: Provides a `runCycle(workFn)` method to ensure only one cycle runs concurrently and its promise is tracked.

### How to Implement a New Worker

When creating a new background worker, follow these steps:

1. **Extend `BaseWorker`**:
   ```typescript
   import { BaseWorker } from "./baseWorker";
   
   export class MyNewWorker extends BaseWorker { ... }
   ```

2. **Implement `clearScheduledTasks()`**:
   ```typescript
   protected clearScheduledTasks(): void {
     if (this.intervalHandle) {
       clearInterval(this.intervalHandle);
       this.intervalHandle = null;
     }
   }
   ```

3. **Wrap Execution in `runCycle`**:
   ```typescript
   start(): void {
     this.intervalHandle = setInterval(() => {
       void this.runCycle(() => this.doWork());
     }, 10000);
   }
   ```

4. **Check the Shutdown Flag (for long-running batches)**:
   ```typescript
   private async doWork(): Promise<void> {
     for (const item of items) {
       if (this.isShuttingDown) break;
       await processItem(item);
     }
   }
   ```

## Server Orchestration (`src/index.ts`)

The server entry point orchestrates the shutdown using signal handlers:

```typescript
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
```

The `shutdown` function:
1. Prevents duplicate shutdown executions.
2. Notifies the configured alerting channels (e.g., Slack).
3. Calls `.stop()` on all active workers concurrently using `Promise.all()`.
4. Implements a timeout fallback (default 15 seconds) using `Promise.race()` to ensure the process exits even if a worker hangs.
5. Closes the HTTP server and exits the process cleanly.
