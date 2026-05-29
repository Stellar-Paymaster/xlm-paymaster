# Community Plugin Marketplace

**Issue:** #517 · Architectural & Product Expansion  
**File:** `src/services/pluginMarketplace.ts`

## Overview

The Community Plugin Marketplace provides a runtime registry for third-party validation plugins. Operators can install, configure, and remove plugins without redeploying the server. Plugins are executed in a sequential, sandboxed pipeline that enforces ordering, timeouts, and fail-open/fail-closed policies.

### Motivating use case: custom OFAC blocklists

The built-in OFAC screening module fetches the US Treasury SDN list. Compliance teams may need to add internal blocklists (jurisdiction-specific sanctions, customer dispute holds) without touching the core screening code. A validation plugin provides a clean extension point.

```typescript
import { registerPlugin, ValidationPlugin } from "./pluginMarketplace";

const internalBlocklist: ValidationPlugin = {
  metadata: {
    id: "ofac-custom-lists",
    name: "Internal Compliance Blocklist",
    version: "1.0.0",
    author: "compliance-team",
    description: "Extends OFAC screening with internal address blocks",
    category: "validation",
    status: "active",
    priority: 1,          // Runs before all other validation plugins
    config: {},
  },
  async execute(ctx) {
    const hits = ctx.addresses.filter(a => myCustomList.has(a));
    return {
      blocked: hits.length > 0,
      blockedAddresses: hits,
      reason: "Address on internal compliance list",
    };
  },
};

registerPlugin(internalBlocklist);
```

## Architecture

```
Incoming request
      │
      ▼
runPluginPipeline(ctx)
      │
      ├─ Plugin A (priority 1)  → pass
      ├─ Plugin B (priority 50) → pass
      └─ Plugin C (priority 100)→ BLOCK ──► short-circuit, return results
```

Plugins are sorted by `priority` (ascending). The pipeline short-circuits at the first blocking result.

## API Reference

| Function | Description |
|---|---|
| `registerPlugin(plugin)` | Install or update a plugin |
| `unregisterPlugin(id)` | Remove a plugin |
| `listPlugins(filter?)` | List plugins, optionally filtered by category/status |
| `getPlugin(id)` | Fetch a single plugin's metadata |
| `updatePlugin(id, patch)` | Update config, status, or priority at runtime |
| `runPluginPipeline(ctx)` | Execute all active plugins; returns array of `PluginResult` |
| `isPipelineClear(ctx)` | Convenience wrapper; returns `true` if no plugin blocked |

## Plugin execution context

```typescript
interface PluginExecutionContext {
  tenantId: string;
  chainId: string;
  addresses: string[];       // All addresses involved in the transaction
  transactionHash?: string;
  requestId?: string;
}
```

## Configuration

| Env variable | Default | Description |
|---|---|---|
| `PLUGIN_TIMEOUT_MS` | `5000` | Hard timeout per plugin execution |
| `PLUGIN_FAIL_CLOSED` | `false` | When `true`, a plugin error blocks the transaction |

## Security notes

- Plugin IDs must match `/^[a-z0-9][a-z0-9-]{0,63}$/` to prevent injection.
- Plugins run in the Node.js event loop — they cannot access filesystem or spawn processes unless explicitly permitted by the host.
- Every register/unregister/execution is logged to the audit log.
- The pipeline hard-times out each plugin at `PLUGIN_TIMEOUT_MS`.

## Categories

| Category | Purpose |
|---|---|
| `validation` | Address / transaction screening (e.g. OFAC) |
| `kyc` | Identity checks |
| `rate-limit` | Custom throttle rules per tenant or chain |
| `notification` | Custom alert sinks |
| `analytics` | Telemetry enrichment |
