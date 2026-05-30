import {
  Config,
  HorizonSelectionStrategy,
} from "../config";
import { createLogger, serializeError } from "../utils/logger";

import StellarSdk from "@stellar/stellar-sdk";
import { CircuitBreaker, CircuitBreakerStatus } from "./circuitBreaker";

export type HorizonNodeState = "Active" | "Degraded" | "Inactive";

export interface HorizonNodeStatus {
  url: string;
  state: HorizonNodeState;
  consecutiveFailures: number;
  lastError?: string;
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastProbeAt?: string;
  retryAt?: string;
  lastResponseTimeMs?: number;
  circuitBreaker?: CircuitBreakerStatus;
}

interface HorizonNodeRuntimeState {
  server: any;
  status: HorizonNodeStatus;
  cooldownUntil: number;
  probeInFlight: boolean;
  cb: CircuitBreaker;
}

export interface HorizonSubmissionResult {
  result: any;
  nodeUrl: string;
  attempts: number;
}

const logger = createLogger({ component: "horizon_failover" });
const FAILURE_COOLDOWN_BASE_MS = 5_000;
const FAILURE_COOLDOWN_MAX_MS = 60_000;
const INACTIVE_FAILURE_THRESHOLD = 3;

type RetryDisposition = "retryable" | "final";

function formatError (error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getStatusCode (error: any): number | undefined {
  return (
    error?.response?.status ||
    error?.response?.statusCode ||
    error?.status ||
    error?.statusCode
  );
}

function getErrorCode (error: any): string | undefined {
  return error?.code || error?.cause?.code;
}

function classifySubmissionError (error: any): RetryDisposition {
  const statusCode = getStatusCode(error);

  if (statusCode !== undefined) {
    if ([408, 429, 500, 502, 503, 504].includes(statusCode)) {
      return "retryable";
    }

    if (statusCode >= 400 && statusCode < 500) {
      return "final";
    }
  }

  const errorCode = getErrorCode(error);
  if (
    errorCode &&
    [
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
      "ETIMEDOUT",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
    ].includes(errorCode)
  ) {
    return "retryable";
  }

  const message = formatError(error).toLowerCase();
  if (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("socket") ||
    message.includes("fetch failed") ||
    message.includes("connection refused")
  ) {
    return "retryable";
  }

  return "final";
}

function getCooldownMs (consecutiveFailures: number): number {
  return Math.min(
    FAILURE_COOLDOWN_BASE_MS * (2 ** Math.max(0, consecutiveFailures - 1)),
    FAILURE_COOLDOWN_MAX_MS
  );
}

export class HorizonFailoverClient {
  private readonly nodes: HorizonNodeRuntimeState[];
  private readonly strategy: HorizonSelectionStrategy;
  private roundRobinIndex = 0;

  constructor(urls: string[], strategy: HorizonSelectionStrategy = "priority") {
    if (urls.length === 0) {
      throw new Error("At least one Horizon URL is required");
    }

    this.strategy = strategy;
    this.nodes = urls.map((url) => ({
      server: new StellarSdk.Horizon.Server(url),
      status: {
        url,
        state: "Active",
        consecutiveFailures: 0,
      },
      cooldownUntil: 0,
      probeInFlight: false,
      cb: new CircuitBreaker({ label: url }),
    }));
  }

  static fromConfig (config: Config): HorizonFailoverClient {
    return new HorizonFailoverClient(
      config.horizonUrls,
      config.horizonSelectionStrategy
    );
  }

  getNodeStatuses (): HorizonNodeStatus[] {
    return this.nodes.map((node) => ({
      ...node.status,
      circuitBreaker: node.cb.getStatus(),
    }));
  }

  async submitTransaction (
    transaction: any
  ): Promise<HorizonSubmissionResult> {
    this.scheduleRecoveryProbe();
    const orderedNodes = this.getOrderedNodes();
    let lastError: unknown;

    for (let attemptIndex = 0; attemptIndex < orderedNodes.length; attemptIndex += 1) {
      const node = orderedNodes[attemptIndex];
      const attemptNumber = attemptIndex + 1;
      const startedAt = Date.now();

      logger.info(
        {
          attempt: attemptNumber,
          node_url: node.status.url,
          strategy: this.strategy,
          total_nodes: orderedNodes.length,
        },
        "Submitting transaction via Horizon node"
      );

      if (!node.cb.allowRequest()) {
        logger.warn(
          {
            attempt: attemptNumber,
            node_url: node.status.url,
            circuit_breaker_state: node.cb.getState(),
          },
          "Circuit breaker open — skipping Horizon node"
        );
        continue;
      }

      try {
        const result = await node.server.submitTransaction(transaction);
        node.cb.recordSuccess();
        this.markNodeActive(node, Date.now() - startedAt);
        logger.info(
          {
            attempt: attemptNumber,
            node_url: node.status.url,
            response_time_ms: node.status.lastResponseTimeMs,
            tx_hash: result.hash,
          },
          "Transaction submission succeeded"
        );

        return {
          result,
          nodeUrl: node.status.url,
          attempts: attemptNumber,
        };
      } catch (error: any) {
        lastError = error;
        const disposition = classifySubmissionError(error);

        if (disposition === "final") {
          node.cb.recordSuccess();
          logger.warn(
            {
              ...serializeError(error),
              attempt: attemptNumber,
              disposition,
              node_url: node.status.url,
              response_time_ms: Date.now() - startedAt,
            },
            "Transaction submission failed with a non-retryable Horizon error"
          );
          throw error;
        }

        node.cb.recordFailure();
        this.markNodeUnavailable(node, error, Date.now() - startedAt);
        logger.warn(
          {
            ...serializeError(error),
            attempt: attemptNumber,
            disposition,
            node_url: node.status.url,
            response_time_ms: node.status.lastResponseTimeMs,
            retry_at: node.status.retryAt,
            circuit_breaker_state: node.cb.getState(),
          },
          "Transaction submission failed on Horizon node"
        );
      }
    }

    throw lastError;
  }

  async getTransaction (
    hash: string
  ): Promise<any> {
    this.scheduleRecoveryProbe();
    const orderedNodes = this.getOrderedNodes();
    let lastError: unknown;

    for (const node of orderedNodes) {
      if (!node.cb.allowRequest()) {
        logger.warn(
          { node_url: node.status.url, circuit_breaker_state: node.cb.getState() },
          "Circuit breaker open — skipping Horizon node for transaction lookup"
        );
        continue;
      }

      const startedAt = Date.now();
      try {
        const result = await node.server.transactions().transaction(hash).call();
        node.cb.recordSuccess();
        this.markNodeActive(node, Date.now() - startedAt);
        return result;
      } catch (error: any) {
        lastError = error;
        const disposition = classifySubmissionError(error);

        if (disposition === "retryable") {
          node.cb.recordFailure();
          this.markNodeUnavailable(node, error, Date.now() - startedAt);
          logger.warn(
            {
              ...serializeError(error),
              disposition,
              node_url: node.status.url,
              response_time_ms: node.status.lastResponseTimeMs,
              retry_at: node.status.retryAt,
              tx_hash: hash,
              circuit_breaker_state: node.cb.getState(),
            },
            "Transaction lookup failed on Horizon node"
          );
          continue;
        }

        node.cb.recordSuccess();
        throw error;
      }
    }

    throw lastError;
  }

  async loadAccount(publicKey: string): Promise<any> {
    this.scheduleRecoveryProbe();
    const orderedNodes = this.getOrderedNodes();
    let lastError: unknown;

    for (const node of orderedNodes) {
      if (!node.cb.allowRequest()) {
        logger.warn(
          { node_url: node.status.url, circuit_breaker_state: node.cb.getState() },
          "Circuit breaker open — skipping Horizon node for account lookup"
        );
        continue;
      }

      const startedAt = Date.now();
      try {
        const result = await node.server.loadAccount(publicKey);
        node.cb.recordSuccess();
        this.markNodeActive(node, Date.now() - startedAt);
        return result;
      } catch (error: any) {
        lastError = error;
        const statusCode = getStatusCode(error);

        if (statusCode === 404) {
          node.cb.recordSuccess();
          throw error;
        }

        const disposition = classifySubmissionError(error);

        if (disposition === "retryable") {
          node.cb.recordFailure();
          this.markNodeUnavailable(node, error, Date.now() - startedAt);
          logger.warn(
            {
              ...serializeError(error),
              disposition,
              node_url: node.status.url,
              response_time_ms: node.status.lastResponseTimeMs,
              retry_at: node.status.retryAt,
              public_key: publicKey,
              circuit_breaker_state: node.cb.getState(),
            },
            "Account lookup failed on Horizon node"
          );
          continue;
        }

        node.cb.recordSuccess();
        throw error;
      }
    }

    throw lastError;
  }

  private getOrderedNodes (): HorizonNodeRuntimeState[] {
    const recoverableNodes = this.getRecoverableNodes();
    const coolingNodes = this.getCoolingNodes();

    if (this.strategy === "round_robin") {
      const activeNodes = this.getActiveNodes();
      const primaryPool = activeNodes.length > 0
        ? activeNodes
        : [...recoverableNodes, ...coolingNodes];
      const rotatedPrimaryPool = this.rotateNodes(primaryPool);
      const secondaryPool = activeNodes.length > 0
        ? [...recoverableNodes, ...coolingNodes]
        : [];

      return [...rotatedPrimaryPool, ...secondaryPool];
    }

    return [...this.getActiveNodes(), ...recoverableNodes, ...coolingNodes];
  }

  private getActiveNodes (): HorizonNodeRuntimeState[] {
    return this.nodes.filter((node) => node.status.state === "Active");
  }

  private getRecoverableNodes (): HorizonNodeRuntimeState[] {
    const now = Date.now();

    return this.nodes
      .filter(
        (node) =>
          node.status.state !== "Active" &&
          now >= node.cooldownUntil
      )
      .sort((left, right) => left.cooldownUntil - right.cooldownUntil);
  }

  private getCoolingNodes (): HorizonNodeRuntimeState[] {
    const now = Date.now();

    return this.nodes
      .filter(
        (node) =>
          node.status.state !== "Active" &&
          now < node.cooldownUntil
      )
      .sort((left, right) => left.cooldownUntil - right.cooldownUntil);
  }

  private rotateNodes (
    nodes: HorizonNodeRuntimeState[]
  ): HorizonNodeRuntimeState[] {
    if (nodes.length <= 1) {
      return nodes;
    }

    const start = this.roundRobinIndex % nodes.length;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % nodes.length;

    return nodes.map((_, offset) => nodes[(start + offset) % nodes.length]);
  }

  private scheduleRecoveryProbe (): void {
    if (this.getActiveNodes().length === 0) {
      return;
    }

    void this.maybeProbeRecoveringNode();
  }

  private async maybeProbeRecoveringNode (): Promise<void> {
    const candidate = this.nodes.find(
      (node) =>
        node.status.state !== "Active" &&
        !node.probeInFlight &&
        Date.now() >= node.cooldownUntil
    );

    if (!candidate) {
      return;
    }

    candidate.probeInFlight = true;
    candidate.status.lastProbeAt = new Date().toISOString();
    const startedAt = Date.now();

    try {
      await candidate.server.serverInfo();
      candidate.cb.recordSuccess();
      this.markNodeActive(candidate, Date.now() - startedAt);
      logger.info(
        {
          node_url: candidate.status.url,
          response_time_ms: candidate.status.lastResponseTimeMs,
          circuit_breaker_state: candidate.cb.getState(),
        },
        "Horizon recovery probe succeeded"
      );
    } catch (error) {
      candidate.cb.recordFailure();
      this.markNodeUnavailable(candidate, error, Date.now() - startedAt);
      logger.warn(
        {
          ...serializeError(error),
          node_url: candidate.status.url,
          response_time_ms: candidate.status.lastResponseTimeMs,
          retry_at: candidate.status.retryAt,
          circuit_breaker_state: candidate.cb.getState(),
        },
        "Horizon recovery probe failed"
      );
    } finally {
      candidate.probeInFlight = false;
    }
  }

  private markNodeActive (
    node: HorizonNodeRuntimeState,
    responseTimeMs?: number
  ): void {
    node.status.state = "Active";
    node.status.consecutiveFailures = 0;
    node.status.lastError = undefined;
    node.cooldownUntil = 0;
    node.status.lastCheckedAt = new Date().toISOString();
    node.status.lastSuccessAt = node.status.lastCheckedAt;
    node.status.retryAt = undefined;
    node.status.lastResponseTimeMs = responseTimeMs;
    logger.info(
      {
        consecutive_failures: node.status.consecutiveFailures,
        node_state: node.status.state,
        node_url: node.status.url,
        response_time_ms: node.status.lastResponseTimeMs,
      },
      "Horizon node marked active"
    );
  }

  private markNodeUnavailable (
    node: HorizonNodeRuntimeState,
    error: unknown,
    responseTimeMs?: number
  ): void {
    const checkedAt = new Date();
    const consecutiveFailures = node.status.consecutiveFailures + 1;
    const cooldownMs = getCooldownMs(consecutiveFailures);

    node.status.state =
      consecutiveFailures >= INACTIVE_FAILURE_THRESHOLD
        ? "Inactive"
        : "Degraded";
    node.status.consecutiveFailures += 1;
    node.status.lastError = formatError(error);
    node.status.lastCheckedAt = checkedAt.toISOString();
    node.status.lastFailureAt = node.status.lastCheckedAt;
    node.status.retryAt = new Date(checkedAt.getTime() + cooldownMs).toISOString();
    node.status.lastResponseTimeMs = responseTimeMs;
    node.cooldownUntil = checkedAt.getTime() + cooldownMs;
    logger.warn(
      {
        consecutive_failures: node.status.consecutiveFailures,
        last_error: node.status.lastError,
        node_state: node.status.state,
        node_url: node.status.url,
        response_time_ms: node.status.lastResponseTimeMs,
        retry_at: node.status.retryAt,
      },
      "Horizon node marked unavailable"
    );
  }
}

let sharedClient: HorizonFailoverClient | null = null;

export function initializeHorizonFailoverClient (
  config: Config
): HorizonFailoverClient {
  sharedClient = HorizonFailoverClient.fromConfig(config);
  return sharedClient;
}

export function getHorizonFailoverClient (): HorizonFailoverClient | null {
  return sharedClient;
}
