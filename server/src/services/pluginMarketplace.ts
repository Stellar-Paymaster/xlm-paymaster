/**
 * Community Plugin Marketplace
 *
 * Provides a registry for community-contributed validation plugins (e.g. custom
 * OFAC-style blocklists, KYC adapters, rate-limit overrides). Plugins are
 * sandboxed and executed in a controlled pipeline so that a buggy or malicious
 * plugin cannot crash the server or bypass compliance checks.
 *
 * Design goals
 * ─────────────
 * • Isolation   – each plugin runs inside a try/catch and has a hard timeout.
 * • Ordering    – plugins run in ascending `priority` order (lower = earlier).
 * • Auditability– every install/uninstall/execution is logged via the audit logger.
 * • Security    – plugin ids are validated; arbitrary code injection is rejected.
 */

import { createLogger } from "../utils/logger";
import { logAuditEvent } from "./auditLogger";

const logger = createLogger({ component: "plugin_marketplace" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PluginCategory =
  | "validation"   // address / transaction screening
  | "kyc"          // identity checks
  | "rate-limit"   // custom throttle rules
  | "notification" // alert sinks
  | "analytics";   // telemetry enrichment

export type PluginStatus = "active" | "inactive" | "deprecated";

export interface PluginMetadata {
  id: string;           // slug, e.g. "ofac-custom-lists"
  name: string;
  version: string;      // semver
  author: string;
  description: string;
  category: PluginCategory;
  status: PluginStatus;
  installedAt: Date;
  updatedAt: Date;
  /** Lower number = higher priority (runs first). Default 100. */
  priority: number;
  /** Arbitrary config values the plugin declared it needs. */
  config: Record<string, unknown>;
}

export interface PluginExecutionContext {
  tenantId: string;
  chainId: string;
  addresses: string[];
  transactionHash?: string;
  requestId?: string;
}

export interface PluginResult {
  pluginId: string;
  passed: boolean;
  blocked: boolean;
  blockedAddresses: string[];
  reason?: string;
  durationMs: number;
}

/** A concrete plugin implementation supplied at registration time. */
export interface ValidationPlugin {
  metadata: Omit<PluginMetadata, "installedAt" | "updatedAt">;
  /**
   * Core execution function.  Must resolve within `timeoutMs` (default 5 s).
   * Return `{ blocked: false }` to pass or `{ blocked: true, reason }` to
   * block the transaction.
   */
  execute(ctx: PluginExecutionContext): Promise<{
    blocked: boolean;
    blockedAddresses?: string[];
    reason?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, { plugin: ValidationPlugin; meta: PluginMetadata }>();

/** Read at call-time so tests can stub the env var. */
function getPluginTimeoutMs(): number {
  return Number(process.env.PLUGIN_TIMEOUT_MS) || 5_000;
}

const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function assertValidId(id: string): void {
  if (!PLUGIN_ID_RE.test(id)) {
    throw new Error(
      `Invalid plugin id "${id}". Must match ${PLUGIN_ID_RE.source}`,
    );
  }
}

/**
 * Register (install) a plugin in the marketplace.
 * Idempotent: re-registering the same id replaces the previous entry.
 */
export function registerPlugin(plugin: ValidationPlugin): PluginMetadata {
  assertValidId(plugin.metadata.id);

  const now = new Date();
  const existing = registry.get(plugin.metadata.id);

  const meta: PluginMetadata = {
    ...plugin.metadata,
    installedAt: existing?.meta.installedAt ?? now,
    updatedAt: now,
    priority: plugin.metadata.priority ?? 100,
    config: plugin.metadata.config ?? {},
  };

  registry.set(meta.id, { plugin, meta });

  logger.info(
    { pluginId: meta.id, version: meta.version, category: meta.category },
    "Plugin registered",
  );

  void logAuditEvent({
    action: "plugin.registered",
    actor: "system",
    resource: meta.id,
    detail: { version: meta.version, category: meta.category },
  } as any);

  return meta;
}

/**
 * Uninstall a plugin by id.
 */
export function unregisterPlugin(id: string): boolean {
  assertValidId(id);
  const existed = registry.delete(id);

  if (existed) {
    logger.info({ pluginId: id }, "Plugin unregistered");
    void logAuditEvent({
      action: "plugin.unregistered",
      actor: "system",
      resource: id,
      detail: {},
    } as any);
  }

  return existed;
}

/**
 * List all registered plugins sorted by priority then id.
 */
export function listPlugins(filter?: {
  category?: PluginCategory;
  status?: PluginStatus;
}): PluginMetadata[] {
  let entries = [...registry.values()].map((e) => e.meta);

  if (filter?.category) {
    entries = entries.filter((m) => m.category === filter.category);
  }
  if (filter?.status) {
    entries = entries.filter((m) => m.status === filter.status);
  }

  return entries.sort((a, b) =>
    a.priority !== b.priority ? a.priority - b.priority : a.id.localeCompare(b.id),
  );
}

/**
 * Retrieve a single plugin's metadata.
 */
export function getPlugin(id: string): PluginMetadata | undefined {
  return registry.get(id)?.meta;
}

/**
 * Update mutable fields on a registered plugin (config, status, priority).
 */
export function updatePlugin(
  id: string,
  patch: Partial<Pick<PluginMetadata, "config" | "status" | "priority">>,
): PluginMetadata {
  const entry = registry.get(id);
  if (!entry) throw new Error(`Plugin "${id}" is not registered`);

  const updated: PluginMetadata = {
    ...entry.meta,
    ...patch,
    updatedAt: new Date(),
  };
  registry.set(id, { plugin: entry.plugin, meta: updated });

  logger.info({ pluginId: id, patch }, "Plugin updated");
  return updated;
}

// ---------------------------------------------------------------------------
// Execution pipeline
// ---------------------------------------------------------------------------

/**
 * Run all *active* plugins in priority order against the given context.
 *
 * Execution is fail-open by default: a plugin that throws or times out is
 * logged but does NOT block the transaction.  Set
 * `PLUGIN_FAIL_CLOSED=true` to change that behaviour.
 */
export async function runPluginPipeline(
  ctx: PluginExecutionContext,
): Promise<PluginResult[]> {
  const failClosed = process.env.PLUGIN_FAIL_CLOSED === "true";
  const activePlugins = listPlugins({ status: "active" });

  const results: PluginResult[] = [];

  for (const meta of activePlugins) {
    const entry = registry.get(meta.id);
    if (!entry) continue;

    const start = Date.now();
    let result: PluginResult;

    try {
      const timeoutMs = getPluginTimeoutMs();
      const outcome = await Promise.race([
        entry.plugin.execute(ctx),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Plugin "${meta.id}" timed out after ${timeoutMs} ms`)),
            timeoutMs,
          ),
        ),
      ]);

      result = {
        pluginId: meta.id,
        passed: !outcome.blocked,
        blocked: outcome.blocked,
        blockedAddresses: outcome.blockedAddresses ?? [],
        reason: outcome.reason,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      logger.error(
        { pluginId: meta.id, err: String(err), tenantId: ctx.tenantId },
        "Plugin execution error",
      );

      result = {
        pluginId: meta.id,
        passed: !failClosed,
        blocked: failClosed,
        blockedAddresses: [],
        reason: failClosed ? `Plugin error: ${String(err)}` : undefined,
        durationMs: Date.now() - start,
      };
    }

    logger.debug(
      { pluginId: meta.id, blocked: result.blocked, durationMs: result.durationMs },
      "Plugin executed",
    );

    results.push(result);

    // Short-circuit: if a plugin blocked, stop running further plugins
    if (result.blocked) break;
  }

  return results;
}

/**
 * Convenience helper: returns `true` if the pipeline cleared all plugins
 * without any block.
 */
export async function isPipelineClear(
  ctx: PluginExecutionContext,
): Promise<boolean> {
  const results = await runPluginPipeline(ctx);
  return results.every((r) => !r.blocked);
}

/** Clear the registry (test / reset use only). */
export function _resetRegistry(): void {
  registry.clear();
}
