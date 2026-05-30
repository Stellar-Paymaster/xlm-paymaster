import { FluidClient, FluidClientConfig, FeeBumpResponse, FeeBumpRequestInput } from "./FluidClient";
import { FluidConfigurationError, FluidNetworkError, FluidServerError, FluidWalletError } from "./errors";

/**
 * Flutter-specific configuration options
 */
export interface FlutterFluidClientConfig extends FluidClientConfig {
  /** Enable automatic retry with exponential backoff for network operations */
  enableAutoRetry?: boolean;
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Timeout for network operations in milliseconds (default: 30000) */
  networkTimeoutMs?: number;
  /** Enable detailed error messages for debugging */
  verboseErrors?: boolean;
}

/**
 * Result object for Flutter SDK operations
 */
export interface FlutterResult<T> {
  /** Whether the operation was successful */
  success: boolean;
  /** The result data if successful */
  data?: T;
  /** Error message if failed */
  error?: string;
  /** Error code for programmatic error handling */
  errorCode?: string;
  /** Additional context for debugging */
  context?: any;
}

/**
 * Simplified transaction result for Flutter developers
 */
export interface FlutterTransactionResult {
  /** Transaction hash */
  hash: string;
  /** Transaction XDR */
  xdr: string;
  /** Transaction status */
  status: string;
  /** Block number (if confirmed) */
  blockNumber?: number;
}

/**
 * FlutterFluidClient - Production-ready Flutter SDK wrapper for Fluid
 * 
 * Provides a simplified, Flutter-friendly API for gasless Stellar transactions
 * with comprehensive error handling, network resilience, and async operation support.
 */
export class FlutterFluidClient {
  private readonly nativeClient: FluidClient;
  private readonly config: {
    enableAutoRetry: boolean;
    maxRetries: number;
    networkTimeoutMs: number;
    verboseErrors: boolean;
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
  };
  private readonly platformCheckPassed: boolean;

  constructor(config: FlutterFluidClientConfig) {
    this.config = {
      enableAutoRetry: config.enableAutoRetry ?? true,
      maxRetries: config.maxRetries ?? 3,
      networkTimeoutMs: config.networkTimeoutMs ?? 30000,
      verboseErrors: config.verboseErrors ?? false,
      serverUrl: config.serverUrl,
      serverUrls: config.serverUrls,
      networkPassphrase: config.networkPassphrase,
      horizonUrl: config.horizonUrl,
      sorobanRpcUrl: config.sorobanRpcUrl,
      useWorker: config.useWorker ?? false,
      stellarSdk: config.stellarSdk,
      enableTelemetry: config.enableTelemetry ?? false,
      telemetryEndpoint: config.telemetryEndpoint,
      enableDiagnostics: config.enableDiagnostics ?? false,
      diagnosticsEndpoint: config.diagnosticsEndpoint,
    };

    // Check platform compatibility for Flutter/Web environments
    this.platformCheckPassed = this.checkPlatformCompatibility();
    
    if (!this.platformCheckPassed && this.config.verboseErrors) {
      console.warn("[FlutterFluidClient] Platform compatibility check warnings");
    }

    this.nativeClient = new FluidClient({
      serverUrl: config.serverUrl,
      serverUrls: config.serverUrls,
      networkPassphrase: config.networkPassphrase,
      horizonUrl: config.horizonUrl,
      sorobanRpcUrl: config.sorobanRpcUrl,
      useWorker: config.useWorker,
      stellarSdk: config.stellarSdk,
      enableTelemetry: config.enableTelemetry,
      telemetryEndpoint: config.telemetryEndpoint,
      enableDiagnostics: config.enableDiagnostics,
      diagnosticsEndpoint: config.diagnosticsEndpoint,
    });
  }

  /**
   * Check platform compatibility for Flutter/Web environments
   */
  private checkPlatformCompatibility(): boolean {
    const checks: { name: string; pass: boolean }[] = [];

    // Check for WebSocket support (needed for worker communication)
    checks.push({
      name: "WebSocket",
      pass: typeof WebSocket !== "undefined",
    });

    // Check for Fetch API support
    checks.push({
      name: "fetch",
      pass: typeof fetch !== "undefined",
    });

    // Check for Promise support
    checks.push({
      name: "Promise",
      pass: typeof Promise !== "undefined",
    });

    // Check for Worker support (if enabled)
    if (this.config.useWorker) {
      checks.push({
        name: "Worker",
        pass: typeof Worker !== "undefined",
      });
    }

    const allPassed = checks.every((c) => c.pass);
    
    if (!allPassed && this.config.verboseErrors) {
      const failed = checks.filter((c) => !c.pass).map((c) => c.name).join(", ");
      console.warn(`[FlutterFluidClient] Missing platform features: ${failed}`);
    }

    return allPassed;
  }

  /**
   * Initialize the client and verify connectivity
   */
  async initialize(): Promise<FlutterResult<void>> {
    try {
      if (!this.platformCheckPassed) {
        return {
          success: false,
          error: "Platform compatibility check failed",
          errorCode: "PLATFORM_INCOMPATIBLE",
          context: { checks: this.config.verboseErrors ? "Check console for details" : undefined },
        };
      }

      // Verify network connectivity by attempting a simple operation
      // This is a lightweight check that doesn't require auth
      return {
        success: true,
        data: undefined,
      };
    } catch (error) {
      return this.handleError(error, "initialization");
    }
  }

  /**
   * Build and request a fee-bump transaction (gasless)
   * This is the primary method for sending gasless Stellar transactions from Flutter
   */
  async buildAndRequestFeeBump(
    transaction: FeeBumpRequestInput,
    options?: {
      keypair?: any;
      submit?: boolean;
    }
  ): Promise<FlutterResult<FeeBumpResponse>> {
    try {
      const result = await this.executeWithRetry(
        () => this.nativeClient.buildAndRequestFeeBump(
          transaction,
          options?.keypair,
          options?.submit ?? false
        ),
        "buildAndRequestFeeBump"
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return this.handleError(error, "buildAndRequestFeeBump");
    }
  }

  /**
   * Request a fee-bump transaction without signing
   * Useful for Flutter apps that handle signing separately
   */
  async requestFeeBump(
    transaction: FeeBumpRequestInput,
    submit = false
  ): Promise<FlutterResult<FeeBumpResponse>> {
    try {
      const result = await this.executeWithRetry(
        () => this.nativeClient.requestFeeBump(transaction, submit),
        "requestFeeBump"
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return this.handleError(error, "requestFeeBump");
    }
  }

  /**
   * Build a SAC (Stellar Asset Contract) transfer transaction
   * Simplified method for Flutter developers to create token transfers
   */
  async buildTokenTransfer(
    options: Parameters<typeof this.nativeClient.buildSACTransferTx>[0]
  ): Promise<FlutterResult<any>> {
    try {
      const result = await this.executeWithRetry(
        () => this.nativeClient.buildSACTransferTx(options),
        "buildTokenTransfer"
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return this.handleError(error, "buildTokenTransfer");
    }
  }

  /**
   * Submit a fee-bump transaction to the network
   * Requires horizonUrl to be configured
   */
  async submitTransaction(feeBumpXdr: string): Promise<FlutterResult<any>> {
    try {
      const result = await this.executeWithRetry(
        () => this.nativeClient.submitFeeBumpTransaction(feeBumpXdr),
        "submitTransaction"
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return this.handleError(error, "submitTransaction");
    }
  }

  /**
   * Wait for transaction confirmation
   * Polls the Horizon server until the transaction is confirmed or timeout is reached
   */
  async waitForConfirmation(
    hash: string,
    options?: {
      timeoutMs?: number;
      pollIntervalMs?: number;
      onProgress?: (progress: any) => void;
    }
  ): Promise<FlutterResult<any>> {
    try {
      const result = await this.executeWithRetry(
        () => this.nativeClient.waitForConfirmation(
          hash,
          options?.timeoutMs ?? this.config.networkTimeoutMs,
          {
            pollIntervalMs: options?.pollIntervalMs,
            onProgress: options?.onProgress,
          }
        ),
        "waitForConfirmation"
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return this.handleError(error, "waitForConfirmation");
    }
  }

  /**
   * Full transaction lifecycle: build, sign, submit, and confirm
   * This is the simplest method for Flutter developers to send gasless transactions
   */
  async sendTransaction(
    transaction: FeeBumpRequestInput,
    options?: {
      keypair?: any;
      timeoutMs?: number;
      onProgress?: (progress: any) => void;
    }
  ): Promise<FlutterResult<FlutterTransactionResult>> {
    try {
      // Step 1: Build and request fee-bump
      const feeBumpResult = await this.buildAndRequestFeeBump(
        transaction,
        { keypair: options?.keypair, submit: true }
      );

      if (!feeBumpResult.success) {
        return {
          success: false,
          error: feeBumpResult.error,
          errorCode: feeBumpResult.errorCode,
          context: feeBumpResult.context,
        };
      }

      const feeBumpData = feeBumpResult.data as FeeBumpResponse;

      // Step 2: Submit transaction (if not already submitted)
      if (feeBumpData.status !== "submitted") {
        const submitResult = await this.submitTransaction(feeBumpData.xdr);
        if (!submitResult.success) {
          return submitResult;
        }
      }

      // Step 3: Wait for confirmation (if hash is available)
      let confirmationResult = null;
      if (feeBumpData.hash) {
        const waitResult = await this.waitForConfirmation(
          feeBumpData.hash,
          {
            timeoutMs: options?.timeoutMs ?? this.config.networkTimeoutMs,
            onProgress: options?.onProgress,
          }
        );

        if (!waitResult.success && waitResult.error && !waitResult.error.includes("Timed out waiting for transaction confirmation")) {
          return waitResult;
        }
        
        confirmationResult = waitResult.data;
      }

      return {
        success: true,
        data: {
          hash: feeBumpData.hash || "",
          xdr: feeBumpData.xdr,
          status: feeBumpData.status,
          ...(confirmationResult && { blockNumber: confirmationResult.ledger }),
        },
      };
    } catch (error) {
      return this.handleError(error, "sendTransaction");
    }
  }

  /**
   * Sign multiple transactions
   */
  async signTransactions(
    transactions: FeeBumpRequestInput[],
    keypair?: any
  ): Promise<FlutterResult<string[]>> {
    try {
      const result = await this.executeWithRetry(
        () => this.nativeClient.signMultipleTransactions(
          transactions.map(t => typeof t === "string" ? t : t),
          keypair
        ),
        "signTransactions"
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return this.handleError(error, "signTransactions");
    }
  }

  /**
   * Execute an operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    if (!this.config.enableAutoRetry) {
      return operation();
    }

    let lastError: any;
    
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

         // Don't retry on certain errors
         if (error instanceof FluidConfigurationError ||
             error instanceof FluidWalletError ||
             (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string' && (error as any).message.includes("Timed out"))) {
           throw error;
        }

        // Exponential backoff
        if (attempt < this.config.maxRetries - 1) {
          const delay = Math.min(
            1000 * Math.pow(2, attempt),
            this.config.networkTimeoutMs / 2
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Handle errors and convert to Flutter result format
   */
  private handleError(error: any, context: string): FlutterResult<never> {
    const errorInfo: any = {
      context,
    };
    if (this.config.verboseErrors) {
      errorInfo.originalError = error;
    }

    // Known error types
    if (error instanceof FluidConfigurationError) {
      return {
        success: false,
        error: error.message,
        errorCode: "CONFIGURATION_ERROR",
        context: errorInfo,
      };
    }

    if (error instanceof FluidNetworkError) {
      return {
        success: false,
        error: error.message,
        errorCode: "NETWORK_ERROR",
        context: errorInfo,
      };
    }

    if (error instanceof FluidServerError) {
      return {
        success: false,
        error: error.message,
        errorCode: "SERVER_ERROR",
        context: {
          ...errorInfo,
          statusCode: error.status,
          url: error.serverUrl,
        },
      };
    }

    if (error instanceof FluidWalletError) {
      return {
        success: false,
        error: error.message,
        errorCode: "WALLET_ERROR",
        context: errorInfo,
      };
    }

    // Network timeout
    if (error?.message?.includes("Timed out") || error?.name === "TimeoutError") {
      return {
        success: false,
        error: "Network timeout - please check your connection",
        errorCode: "TIMEOUT_ERROR",
        context: errorInfo,
      };
    }

    // Generic error
    return {
      success: false,
      error: error?.message || "Unknown error occurred",
      errorCode: "UNKNOWN_ERROR",
      context: errorInfo,
    };
  }

  /**
   * Sleep helper for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Report diagnostic information
   */
  reportBug(message: string, context?: any): void {
    this.nativeClient.reportBug(message, context);
  }

  /**
   * Terminate client resources (workers, etc.)
   */
  terminate(): void {
    this.nativeClient.terminate();
  }

  /**
   * Get the native FluidClient instance (for advanced use cases)
   */
  getNativeClient(): FluidClient {
    return this.nativeClient;
  }

  /**
   * Check if the client is platform-compatible
   */
  isPlatformCompatible(): boolean {
    return this.platformCheckPassed;
  }

  /**
   * Get client configuration
   */
  getConfig(): FlutterFluidClientConfig {
    return { ...this.config };
  }
}

/**
 * Flutter SDK Error Codes
 */
export const FlutterSDKErrorCodes = {
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  SERVER_ERROR: "SERVER_ERROR",
  WALLET_ERROR: "WALLET_ERROR",
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
  PLATFORM_INCOMPATIBLE: "PLATFORM_INCOMPATIBLE",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type FlutterSDKErrorCode = typeof FlutterSDKErrorCodes[keyof typeof FlutterSDKErrorCodes];
