import StellarSdk, { SorobanRpc, Transaction, FeeBumpTransaction, Horizon } from "@stellar/stellar-sdk";
import {
  BuildSACTransferTxOptions,
  buildSACTransferTx as buildSACTransferTxHelper,
} from "./soroban";
import {
  createHorizonServer,
  fromTransactionXdr,
  resolveStellarSdk,
} from "./stellarCompatibility";
import {
  collectTelemetry,
  getTelemetryConfig,
  reportDiagnostic,
  TelemetryConfig,
} from "./telemetry";
import {
  FluidConfigurationError,
  FluidNetworkError,
  FluidNoAvailableServerError,
  FluidServerError,
  FluidWalletError,
} from "./errors";

export interface FluidClientConfig {
  serverUrl?: string;
  serverUrls?: string[];
  networkPassphrase: string;
  horizonUrl?: string;
  sorobanRpcUrl?: string;
  useWorker?: boolean;
  stellarSdk?: unknown;
  enableTelemetry?: boolean;
  telemetryEndpoint?: string;
  enableDiagnostics?: boolean;
  diagnosticsEndpoint?: string;
  /**
   * Request timeout in seconds. Default: 30
   */
  timeout?: number;
}

export interface FeeBumpResponse {
  xdr: string;
  status: "ready" | "submitted" | string;
  hash?: string;
  fee_payer?: string;
  submitted_via?: string;
  submission_attempts?: number;
}

export interface FeeBumpRequestBody {
  xdr: string;
  submit?: boolean;
}

export interface FeeBumpBatchRequestBody {
  xdrs: string[];
  submit?: boolean;
}

export type XdrSerializableTransaction = {
  toXDR: () => string;
};

export type FeeBumpRequestInput = string | XdrSerializableTransaction;

// Worker message types
interface WorkerRequest {
  id: string;
  type: "sign_transaction" | "create_xdr";
  data: any;
}

interface WorkerResponse {
  id: string;
  type: "success" | "error";
  result?: any;
  error?: string;
}

export type WaitForConfirmationProgress = {
  hash: string;
  attempt: number;
  elapsedMs: number;
};

export type WaitForConfirmationOptions = {
  pollIntervalMs?: number;
  onProgress?: (progress: WaitForConfirmationProgress) => void;
};

export class FluidClient {
  private readonly serverUrls: string[];
  private readonly networkPassphrase: string;
  private readonly horizonServer?: any;
  private readonly sorobanServer?: SorobanRpc.Server;
  private useWorker: boolean;
  private worker?: Worker;
  private readonly pendingRequests = new Map<
    string,
    { resolve: (val: any) => void; reject: (err: Error) => void; timeout: ReturnType<typeof setTimeout> }
  >();
  private requestIdCounter = 0;
  private readonly horizonUrl?: string;
  private readonly stellarSdk: any;
  private readonly timeout: number;
  private readonly failedNodeCooldownMs = 30_000;
  private readonly baseRetryDelayMs = 250;
  private readonly maxRetryDelayMs = 2_000;
  private readonly nodeFailureState = new Map<
    string,
    { failures: number; failedUntil: number }
  >();
  private readonly telemetryConfig: TelemetryConfig;

  constructor(config: FluidClientConfig) {
    this.serverUrls = this.normalizeServerUrls(config);
    this.networkPassphrase = config.networkPassphrase;
    this.useWorker = config.useWorker || false;
    this.horizonUrl = config.horizonUrl;
    this.timeout = config.timeout || 30;

    this.stellarSdk = resolveStellarSdk(config.stellarSdk ?? StellarSdk);
    if (config.horizonUrl) {
      this.horizonServer = createHorizonServer(this.stellarSdk, config.horizonUrl);
    }

    if (this.useWorker && typeof Worker !== "undefined") {
      this.initializeWorker();
    }
    
    if (config.sorobanRpcUrl) {
      this.sorobanServer = new SorobanRpc.Server(config.sorobanRpcUrl);
    }

    // Initialize telemetry if enabled
    this.telemetryConfig = getTelemetryConfig({
      enabled: config.enableTelemetry,
      endpoint: config.telemetryEndpoint,
      diagnosticsEnabled: config.enableDiagnostics,
      diagnosticsEndpoint: config.diagnosticsEndpoint,
    });
    collectTelemetry(this.telemetryConfig);
  }

  private serializeTransaction(input: FeeBumpRequestInput): string {
    return typeof input === "string" ? input : input.toXDR();
  }

  private normalizeServerUrls(config: FluidClientConfig): string[] {
    const rawUrls = config.serverUrls?.length
      ? config.serverUrls
      : config.serverUrl
        ? [config.serverUrl]
        : [];

    const normalized = rawUrls
      .map((url) => url.trim().replace(/\/+$/, ""))
      .filter(Boolean);

    // Preserve order while deduplicating (parity with Python)
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const url of normalized) {
      if (!seen.has(url)) {
        seen.add(url);
        unique.push(url);
      }
    }

    if (unique.length === 0) {
      throw new FluidConfigurationError(
        "FluidClient requires at least one server URL via serverUrl or serverUrls"
      );
    }

    return unique;
  }

  private getOrderedServerUrls(): string[] {
    const now = Date.now();

    return [...this.serverUrls]
      .map((url, index) => {
        const state = this.nodeFailureState.get(url);
        const isCoolingDown = state ? state.failedUntil > now : false;

        return {
          url,
          index,
          score: isCoolingDown ? 1_000 + state!.failedUntil - now : 0,
        };
      })
      .sort((left, right) => left.score - right.score || left.index - right.index)
      .map((entry) => entry.url);
  }

  private markServerFailure(serverUrl: string): void {
    const previous = this.nodeFailureState.get(serverUrl);
    const failures = (previous?.failures ?? 0) + 1;
    const cooldownMultiplier = Math.min(2 ** (failures - 1), 4);

    this.nodeFailureState.set(serverUrl, {
      failures,
      failedUntil: Date.now() + this.failedNodeCooldownMs * cooldownMultiplier,
    });
  }

  private markServerSuccess(serverUrl: string): void {
    this.nodeFailureState.delete(serverUrl);
  }

  private getRetryDelayMs(attemptIndex: number): number {
    return Math.min(
      this.baseRetryDelayMs * 2 ** attemptIndex,
      this.maxRetryDelayMs
    );
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async performJsonRequest<T>(
    serverUrl: string,
    path: string,
    body: unknown
  ): Promise<T> {
    let response: Response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout * 1000);

    try {
      response = await fetch(`${serverUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      throw new FluidNetworkError(
        isTimeout 
          ? `Fluid server request timed out after ${this.timeout}s` 
          : `Fluid server request failed: ${error instanceof Error ? error.message : String(error)}`,
        serverUrl
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError: any;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        parsedError = errorText;
      }

      throw new FluidServerError(
        `Fluid server error: ${response.status} ${response.statusText}`,
        response.status,
        serverUrl,
        parsedError
      );
    }

    return (await response.json()) as T;
  }

  private async requestWithFallback<T>(path: string, body: unknown): Promise<T> {
    const orderedServerUrls = this.getOrderedServerUrls();
    let lastError: Error | undefined;

    for (let attemptIndex = 0; attemptIndex < orderedServerUrls.length; attemptIndex += 1) {
      const serverUrl = orderedServerUrls[attemptIndex];

      try {
        const result = await this.performJsonRequest<T>(serverUrl, path, body);
        this.markServerSuccess(serverUrl);
        return result;
      } catch (error) {
        // If it's a 400 Bad Request, don't fallback, as it's likely a transaction error
        if (error instanceof FluidServerError && error.status === 400) {
          throw error;
        }

        lastError = error as Error;
        this.markServerFailure(serverUrl);

        if (attemptIndex < orderedServerUrls.length - 1) {
          const retryDelayMs = this.getRetryDelayMs(attemptIndex);
          const nextServerUrl = orderedServerUrls[attemptIndex + 1];
          console.warn(
            `[FluidClient] Request failed on ${serverUrl} (${lastError.message}). Retrying ${path} on ${nextServerUrl} in ${retryDelayMs}ms.`
          );
          await this.sleep(retryDelayMs);
        }
      }
    }

    throw new FluidNoAvailableServerError(
      "All configured Fluid servers failed or are in cool-down.",
      "multiple"
    );
  }

  private initializeWorker(): void {
    try {
      this.worker = new Worker(
        new URL("./workers/signingWorker.ts", import.meta.url),
        { type: "module" }
      );

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { id, type, result, error } = event.data;
        const pending = this.pendingRequests.get(id);

        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(id);

          if (type === "success") {
            pending.resolve(result);
          } else {
            pending.reject(new FluidWalletError(error || "Worker operation failed"));
          }
        }
      };

      this.worker.onerror = (error) => {
        console.error("[FluidClient] Worker error:", error);
        this.useWorker = false;
        this.worker?.terminate();
        this.worker = undefined;
      };

      console.log("[FluidClient] Web Worker initialized for signing operations");
    } catch (error) {
      console.warn("[FluidClient] Failed to initialize worker, falling back to main thread:", error);
      this.useWorker = false;
    }
  }

  private async sendWorkerMessage(
    type: "sign_transaction" | "create_xdr",
    data: any,
    timeout = 30000
  ): Promise<any> {
    if (!this.worker || !this.useWorker) {
      throw new Error("Worker not available");
    }

    const id = `req_${++this.requestIdCounter}`;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Worker operation timed out"));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timeout: timeoutId });

      const request: WorkerRequest = { id, type, data };
      this.worker!.postMessage(request);
    });
  }

  private async signWithWorker(transaction: any): Promise<string> {
    const transactionData = {
      transactionXdr: transaction.toXDR(),
      secretKey: "mock_key_for_demo",
    };

    const result = await this.sendWorkerMessage("sign_transaction", transactionData);
    return result.signedXdr;
  }

  private async signOnMainThread(transaction: any, keypair: any): Promise<string> {
    transaction.sign(keypair);
    return transaction.toXDR();
  }

  async requestFeeBump(
    transaction: FeeBumpRequestInput,
    submit = false
  ): Promise<FeeBumpResponse> {
    return this.requestWithFallback<FeeBumpResponse>("/fee-bump", {
      xdr: this.serializeTransaction(transaction),
      submit,
    });
  }

  async requestFeeBumpBatch(
    transactions: FeeBumpRequestInput[],
    submit = false
  ): Promise<FeeBumpResponse[]> {
    return this.requestWithFallback<FeeBumpResponse[]>("/fee-bump/batch", {
      xdrs: transactions.map((t) => this.serializeTransaction(t)),
      submit,
    });
  }

  async submitFeeBumpTransaction(
    feeBumpXdr: string
  ): Promise<any> {
    if (!this.horizonServer) {
      throw new FluidConfigurationError("Horizon URL not configured");
    }

    const feeBumpTx = fromTransactionXdr(this.stellarSdk, feeBumpXdr, this.networkPassphrase);
    return await this.horizonServer.submitTransaction(feeBumpTx);
  }

  async waitForConfirmation(
    hash: string,
    timeoutMs = 60_000,
    options: WaitForConfirmationOptions = {}
  ): Promise<any> {
    if (!this.horizonUrl) {
      throw new FluidConfigurationError("Horizon URL not configured");
    }

    const pollIntervalMs = options.pollIntervalMs ?? 1_500;
    const startedAt = Date.now();
    let attempt = 0;

    while (Date.now() - startedAt < timeoutMs) {
      attempt += 1;
      options.onProgress?.({
        hash,
        attempt,
        elapsedMs: Date.now() - startedAt,
      });

      try {
        const res = await fetch(`${this.horizonUrl}/transactions/${hash}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (res.status === 404) {
          await this.sleep(pollIntervalMs);
          continue;
        }

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new FluidServerError(`Horizon error while confirming tx: ${res.statusText}`, res.status, this.horizonUrl, body);
        }

        return await res.json();
      } catch (error) {
        if (error instanceof FluidServerError || error instanceof FluidNetworkError) throw error;
        await this.sleep(pollIntervalMs);
      }
    }

    throw new Error(`Timed out waiting for transaction confirmation after ${timeoutMs}ms: ${hash}`);
  }

  async buildAndRequestFeeBump(
    transaction: any,
    keypair?: any,
    submit = false
  ): Promise<FeeBumpResponse> {
    let signedXdr: string;

    if (this.useWorker && this.worker) {
      try {
        signedXdr = await this.signWithWorker(transaction);
      } catch (error) {
        console.warn("[FluidClient] Worker signing failed, using main thread fallback");
        if (!keypair) throw new FluidWalletError("Keypair required for main thread signing fallback");
        signedXdr = await this.signOnMainThread(transaction, keypair);
      }
    } else {
      if (!keypair) throw new FluidWalletError("Keypair required for signing");
      signedXdr = await this.signOnMainThread(transaction, keypair);
    }

    return await this.requestFeeBump(signedXdr, submit);
  }

  async buildSACTransferTx(
    options: Omit<BuildSACTransferTxOptions, "networkPassphrase" | "sorobanServer">
  ): Promise<Transaction> {
    return buildSACTransferTxHelper({
      ...options,
      networkPassphrase: this.networkPassphrase,
      sorobanServer: this.sorobanServer,
    });
  }

  async signMultipleTransactions(
    transactions: any[],
    keypair?: any
  ): Promise<string[]> {
    const results: string[] = [];
    for (const transaction of transactions) {
      results.push(await this.signOnMainThread(transaction, keypair));
    }
    return results;
  }

  /**
   * Reports a bug or diagnostic information to the Fluid telemetry service.
   * Only active if enableDiagnostics is set to true in the configuration.
   */
  reportBug(message: string, context?: any): void {
    reportDiagnostic(this.telemetryConfig, message, "error", context);
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = undefined;
    }
    this.pendingRequests.clear();
  }

  /**
   * Sign a transaction with any {@link WalletSigner} (WalletConnect, a SEP-43
   * browser wallet, or an in-process keypair), defaulting the network
   * passphrase to the one this client was configured with.
   */
  async signWithWallet(
    signer: WalletSigner,
    transaction: TransactionInput,
    options: SignTransactionOptions = {}
  ): Promise<SignedTransaction> {
    if (!signer || typeof signer.signTransaction !== "function") {
      throw new Error("signWithWallet requires a WalletSigner");
    }

    return signer.signTransaction(transaction, {
      networkPassphrase: this.networkPassphrase,
      ...options,
    });
  }

  /**
   * Sign a transaction through a wallet and request a fee bump for the signed
   * envelope. The universal-signing entry point for example applications.
   */
  async buildAndRequestFeeBumpWithWallet(
    signer: WalletSigner,
    transaction: TransactionInput,
    submit: boolean = false,
    options: SignTransactionOptions = {}
  ): Promise<FeeBumpResponse> {
    const signed = await this.signWithWallet(signer, transaction, options);
    return this.requestFeeBump(signed.signedTxXdr, submit);
  }
}
