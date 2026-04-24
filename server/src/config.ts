import StellarSdk from "@stellar/stellar-sdk";
import { SignerPool, SignerSelectionStrategy } from "./signing";

export type HorizonSelectionStrategy = "priority" | "round_robin";

export interface FeePayerAccount {
  publicKey: string;
  keypair: ReturnType<typeof StellarSdk.Keypair.fromSecret>;
  secretSource:
    | { type: "env"; secret: string }
    | { type: "db"; encrypted: true }
    | { type: "vault"; secretPath: string };
}

export interface VaultConfig {
  addr: string;
  appRole?: {
    roleId: string;
    secretId: string;
  };
  kvMount: string;
  kvVersion: number;
  secretField: string;
  token?: string;
}

export interface GrpcEngineConfig {
  address: string;
  secondaryAddress?: string;
  pinnedServerCertSha256: string[];
  serverName: string;
  tlsCaPath: string;
  tlsCertPath: string;
  tlsKeyPath: string;
}

export interface SupportedAsset {
  minBalance?: string;
  treasuryRetentionLimit?: string;
}

export interface AlertEmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  to: string[];
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  toNumber: string;
  testMode?: boolean;
}

export interface AlertingConfig {
  lowBalanceThresholdXlm?: number;
  criticalBalanceThresholdXlm?: number;
  checkIntervalMs: number;
  cooldownMs: number;
  slackWebhookUrl?: string;
  email?: AlertEmailConfig;
  twilio?: TwilioConfig;
}

export interface DigestConfig {
  /** Cron expression (default: "0 8 * * *" = 08:00 local every day). */
  cronSchedule: string;
  /** Set to false via DIGEST_ENABLED=false to disable the worker entirely. */
  enabled: boolean;
}

export interface EvmSettlementConfig {
  enabled: boolean;
  chainId: number;
  rpcUrl: string;
  tokenAddress: string;
  receiverAddress: string;
  confirmationsRequired: number;
  pollIntervalMs: number;
  refundFromAddress?: string;
}

export interface KycConfig {
  enabled: boolean;
  endpointUrl?: string;
  apiKey?: string;
  timeoutMs: number;
  failClosed: boolean;
}

export interface WorkerConfig {
  ledgerMonitorConcurrency: number;
}

export interface Config {
  allowedOrigins: string[];
  alerting: AlertingConfig;
  baseFee: number;
  crossChainSettlementTimeoutMinutes: number;
  digest?: DigestConfig;
  feeMultiplier: number;
  feePayerAccounts: FeePayerAccount[];
  grpcEngine?: GrpcEngineConfig;
  horizonSelectionStrategy: HorizonSelectionStrategy;
  horizonUrl?: string;
  horizonUrls: string[];
  ipAllowlist: string[];
  ipDenylist: string[];
  maxOperations: number;
  maxXdrSize: number;
  networkPassphrase: string;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  signerPool: SignerPool;
  stellarRpcUrl?: string;
  supportedAssets?: SupportedAsset[];
  vault?: VaultConfig;
  evmSettlement?: EvmSettlementConfig;
  kyc: KycConfig;
  treasury: TreasuryConfig;
  workers: WorkerConfig;
}

export interface TreasuryConfig {
  coldWallet: string;
  retentionLimitXlm: number;
  cronSchedule: string;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Utility parsers
// ---------------------------------------------------------------------------

function parseCommaSeparatedList(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  );
}

function parseRequiredPath(
  value: string | undefined,
  name: string,
): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required when gRPC engine mode is enabled`);
  }
  return trimmed;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseBoolean(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseBoundedPositiveInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = parsePositiveInt(value, fallback);
  return Math.min(Math.max(parsed, min), max);
}

function parseSupportedAssets(value: string | undefined): SupportedAsset[] {
  if (!value) {
    return [];
  }
  // Expect entry format: CODE:ISSUER:MIN_BALANCE (ISSUER and MIN_BALANCE are optional)
  return parseCommaSeparatedList(value).map((entry) => {
    const parts = entry.split(":").map((p) => p.trim());
    return {
      code: parts[0],
      issuer: parts[1] || undefined,
      minBalance: parts[2] || undefined,
      treasuryRetentionLimit: parts[3] || undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Config loaders
// ---------------------------------------------------------------------------

function loadVaultConfig(): VaultConfig | undefined {
  const addr = process.env.VAULT_ADDR?.trim();
  if (!addr) {
    return undefined;
  }
  const roleId = process.env.VAULT_ROLE_ID?.trim();
  const secretId = process.env.VAULT_SECRET_ID?.trim();

  return {
    addr,
    token: process.env.VAULT_TOKEN?.trim() || undefined,
    appRole:
      roleId && secretId ? { roleId, secretId } : undefined,
    kvMount: process.env.VAULT_KV_MOUNT?.trim() || "secret",
    kvVersion: process.env.VAULT_KV_VERSION === "1" ? 1 : 2,
    secretField: process.env.VAULT_SECRET_FIELD?.trim() || "secret",
  };
}

function loadGrpcEngineConfig(): GrpcEngineConfig | undefined {
  const address = process.env.FLUID_GRPC_ENGINE_ADDRESS?.trim();
  if (!address) {
    return undefined;
  }

  return {
    address,
    secondaryAddress: process.env.FLUID_GRPC_ENGINE_SECONDARY_ADDRESS?.trim(),
    pinnedServerCertSha256: parseCommaSeparatedList(
      process.env.FLUID_GRPC_ENGINE_PINNED_SERVER_CERT_SHA256,
    ).map((value) =>
      value.replace(/^sha256:/i, "").replace(/[^a-fA-F0-9]/g, "").toLowerCase(),
    ),
    serverName:
      process.env.FLUID_GRPC_ENGINE_TLS_SERVER_NAME?.trim() ||
      "fluid-grpc-engine.internal",
    tlsCaPath: parseRequiredPath(
      process.env.FLUID_GRPC_ENGINE_CLIENT_CA_PATH,
      "FLUID_GRPC_ENGINE_CLIENT_CA_PATH",
    ),
    tlsCertPath: parseRequiredPath(
      process.env.FLUID_GRPC_ENGINE_CLIENT_CERT_PATH,
      "FLUID_GRPC_ENGINE_CLIENT_CERT_PATH",
    ),
    tlsKeyPath: parseRequiredPath(
      process.env.FLUID_GRPC_ENGINE_CLIENT_KEY_PATH,
      "FLUID_GRPC_ENGINE_CLIENT_KEY_PATH",
    ),
  };
}

function loadAlertEmailConfig(): AlertEmailConfig | undefined {
  const host = process.env.FLUID_ALERT_SMTP_HOST?.trim();
  const from = process.env.FLUID_ALERT_EMAIL_FROM?.trim();
  const to = parseCommaSeparatedList(process.env.FLUID_ALERT_EMAIL_TO);

  if (!host || !from || to.length === 0) {
    return undefined;
  }

  return {
    host,
    port: parsePositiveInt(process.env.FLUID_ALERT_SMTP_PORT, 587),
    secure: process.env.FLUID_ALERT_SMTP_SECURE === "true",
    user: process.env.FLUID_ALERT_SMTP_USER?.trim() || undefined,
    pass: process.env.FLUID_ALERT_SMTP_PASS?.trim() || undefined,
    from,
    to,
  };
}

function loadTwilioConfig(): TwilioConfig | undefined {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM?.trim();
  const toNumber = process.env.ALERT_PHONE_NUMBER?.trim();
  const testMode = process.env.TWILIO_TEST_MODE === "true";

  if (!accountSid || !authToken || !fromNumber || !toNumber) {
    return undefined;
  }

  return {
    accountSid,
    authToken,
    fromNumber,
    toNumber,
    testMode,
  };
}

function loadAlertingConfig(): AlertingConfig {
  return {
    lowBalanceThresholdXlm: parseOptionalNumber(
      process.env.FLUID_LOW_BALANCE_THRESHOLD_XLM,
    ),
    criticalBalanceThresholdXlm: parseOptionalNumber(
      process.env.CRITICAL_BALANCE_XLM,
    ),
    checkIntervalMs: parsePositiveInt(
      process.env.FLUID_LOW_BALANCE_CHECK_INTERVAL_MS,
      60 * 60 * 1000,
    ),
    cooldownMs: parsePositiveInt(
      process.env.FLUID_LOW_BALANCE_ALERT_COOLDOWN_MS,
      6 * 60 * 60 * 1000,
    ),
    slackWebhookUrl:
      process.env.FLUID_ALERT_SLACK_WEBHOOK_URL?.trim() || undefined,
    email: loadAlertEmailConfig(),
    twilio: loadTwilioConfig(),
  };
}

function loadDigestConfig(): DigestConfig {
  return {
    cronSchedule: process.env.DIGEST_CRON_SCHEDULE?.trim() || "0 8 * * *",
    enabled: process.env.DIGEST_ENABLED !== "false",
  };
}

function loadEvmSettlementConfig(): EvmSettlementConfig | undefined {
  if (process.env.FLUID_EVM_SETTLEMENT_ENABLED !== "true") {
    return undefined;
  }

  const rpcUrl = process.env.FLUID_EVM_RPC_URL?.trim();
  const tokenAddress = process.env.FLUID_EVM_TOKEN_ADDRESS?.trim();
  const receiverAddress = process.env.FLUID_EVM_RECEIVER_ADDRESS?.trim();
  const chainId = parsePositiveInt(process.env.FLUID_EVM_CHAIN_ID, 0);

  if (!rpcUrl || !tokenAddress || !receiverAddress || chainId <= 0) {
    return undefined;
  }

  return {
    enabled: true,
    chainId,
    rpcUrl,
    tokenAddress,
    receiverAddress,
    confirmationsRequired: parsePositiveInt(
      process.env.FLUID_EVM_CONFIRMATIONS_REQUIRED,
      3,
    ),
    pollIntervalMs: parsePositiveInt(
      process.env.FLUID_EVM_WATCH_POLL_INTERVAL_MS,
      5_000,
    ),
    refundFromAddress: process.env.FLUID_EVM_REFUND_FROM_ADDRESS?.trim() || undefined,
  };
}

function loadKycConfig(): KycConfig {
  return {
    enabled: parseBoolean(process.env.FLUID_KYC_ENABLED, false),
    endpointUrl: process.env.FLUID_KYC_ENDPOINT_URL?.trim() || undefined,
    apiKey: process.env.FLUID_KYC_API_KEY?.trim() || undefined,
    timeoutMs: parseBoundedPositiveInt(
      process.env.FLUID_KYC_TIMEOUT_MS,
      2_000,
      250,
      30_000,
    ),
    failClosed: parseBoolean(process.env.FLUID_KYC_FAIL_CLOSED, true),
  };
}

function loadTreasuryConfig(): TreasuryConfig {
  return {
    coldWallet: process.env.TREASURY_COLD_WALLET?.trim() || "",
    retentionLimitXlm: parsePositiveInt(
      process.env.TREASURY_RETENTION_LIMIT_XLM,
      1000,
    ),
    cronSchedule: process.env.TREASURY_SWEEP_CRON_SCHEDULE?.trim() || "0 0 * * *",
    enabled: process.env.TREASURY_SWEEP_ENABLED !== "false",
  };
}

function loadWorkerConfig(): WorkerConfig {
  return {
    ledgerMonitorConcurrency: parseBoundedPositiveInt(
      process.env.FLUID_LEDGER_MONITOR_CONCURRENCY ??
        process.env.LEDGER_MONITOR_THREADS,
      5,
      1,
      64,
    ),
  };
}

export function loadConfig(): Config {
  const baseFee = parsePositiveInt(process.env.FLUID_BASE_FEE, 100);
  const feeMultiplier = Number.parseFloat(
    process.env.FLUID_FEE_MULTIPLIER || "2.0",
  );
  const networkPassphrase =
    process.env.STELLAR_NETWORK_PASSPHRASE ||
    "Test SDF Network ; September 2015";

  const configuredHorizonUrls = parseCommaSeparatedList(
    process.env.STELLAR_HORIZON_URLS,
  );
  const legacyHorizonUrl = process.env.STELLAR_HORIZON_URL?.trim();
  const horizonUrls =
    configuredHorizonUrls.length > 0
      ? configuredHorizonUrls
      : legacyHorizonUrl
        ? [legacyHorizonUrl]
        : [];

  const horizonSelectionStrategy: HorizonSelectionStrategy =
    process.env.FLUID_HORIZON_SELECTION === "round_robin"
      ? "round_robin"
      : "priority";
  const signerSelectionStrategy: SignerSelectionStrategy =
    process.env.FLUID_SIGNER_SELECTION === "round_robin"
      ? "round_robin"
      : "least_used";

  const rateLimitWindowMs = parsePositiveInt(
    process.env.FLUID_RATE_LIMIT_WINDOW_MS,
    60_000,
  );
  const rateLimitMax = parsePositiveInt(process.env.FLUID_RATE_LIMIT_MAX, 5);
  const allowedOrigins = parseCommaSeparatedList(
    process.env.FLUID_ALLOWED_ORIGINS,
  );
  const maxXdrSize = parsePositiveInt(process.env.FLUID_MAX_XDR_SIZE, 10_240);
  const maxOperations = parsePositiveInt(
    process.env.FLUID_MAX_OPERATIONS,
    100,
  );
  const vault = loadVaultConfig();
  const grpcEngine = loadGrpcEngineConfig();
  const supportedAssets = parseSupportedAssets(
    process.env.FLUID_SUPPORTED_ASSETS,
  );

  const ipAllowlist = parseCommaSeparatedList(process.env.IP_ALLOWLIST);
  const ipDenylist = parseCommaSeparatedList(process.env.IP_DENYLIST);

  const sharedConfig = {
    allowedOrigins,
    alerting: loadAlertingConfig(),
    digest: loadDigestConfig(),
    baseFee,
    feeMultiplier: Number.isFinite(feeMultiplier) ? feeMultiplier : 2,
    horizonSelectionStrategy,
    horizonUrl: horizonUrls[0],
    horizonUrls,
    maxOperations,
    maxXdrSize,
    networkPassphrase,
    evmSettlement: loadEvmSettlementConfig(),
    kyc: loadKycConfig(),
    rateLimitMax,
    rateLimitWindowMs,
    stellarRpcUrl: process.env.STELLAR_RPC_URL?.trim() || undefined,
    supportedAssets,
    vault,
    ipAllowlist,
    ipDenylist,
    grpcEngine,
    crossChainSettlementTimeoutMinutes: parsePositiveInt(
      process.env.CROSS_CHAIN_SETTLEMENT_TIMEOUT_MINUTES,
      10,
    ),
    treasury: loadTreasuryConfig(),
    workers: loadWorkerConfig(),
  };

  // ---- Vault mode ----------------------------------------------------------
  const vaultSecretPaths = parseCommaSeparatedList(
    process.env.FLUID_FEE_PAYER_VAULT_SECRET_PATHS,
  );
  const vaultPublicKeys = parseCommaSeparatedList(
    process.env.FLUID_FEE_PAYER_PUBLIC_KEYS,
  );

  if (vault && vaultSecretPaths.length > 0 && vaultPublicKeys.length > 0) {
    if (vaultSecretPaths.length !== vaultPublicKeys.length) {
      throw new Error(
        "Vault mode requires FLUID_FEE_PAYER_VAULT_SECRET_PATHS and " +
          "FLUID_FEE_PAYER_PUBLIC_KEYS to have the same number of entries",
      );
    }

    const feePayerAccounts: FeePayerAccount[] = vaultPublicKeys.map(
      (publicKey, index) => ({
        publicKey,
        keypair: StellarSdk.Keypair.fromPublicKey(publicKey),
        secretSource: {
          type: "vault" as const,
          secretPath: vaultSecretPaths[index],
        },
      }),
    );

    return {
      ...sharedConfig,
      feePayerAccounts,
      signerPool: new SignerPool(
        feePayerAccounts.map((account) => ({
          keypair: account.keypair,
          secret:
            account.secretSource.type === "vault"
              ? `vault:${account.secretSource.secretPath}`
              : "",
        })),
        { selectionStrategy: signerSelectionStrategy },
      ),
    };
  }

  // ---- Env secret mode -----------------------------------------------------
  const secretEnv = process.env.FLUID_FEE_PAYER_SECRET?.trim();
  if (!secretEnv) {
    throw new Error(
      "No fee payer configured. Set FLUID_FEE_PAYER_SECRET or configure Vault.",
    );
  }

  const secrets =
    parseCommaSeparatedList(secretEnv).length > 0
      ? parseCommaSeparatedList(secretEnv)
      : [secretEnv];

  const feePayerAccounts: FeePayerAccount[] = secrets.map((secret) => {
    const keypair = StellarSdk.Keypair.fromSecret(secret);
    return {
      publicKey: keypair.publicKey(),
      keypair,
      secretSource: { type: "env" as const, secret },
    };
  });

  return {
    ...sharedConfig,
    feePayerAccounts,
    signerPool: SignerPool.fromSecrets(secrets, {
      selectionStrategy: signerSelectionStrategy,
    }),
  };
}

// ---------------------------------------------------------------------------
// Round-robin fee payer selection
// ---------------------------------------------------------------------------

let rrIndex = 0;

export function pickFeePayerAccount(config: Config): FeePayerAccount {
  const snapshot = config.signerPool.getSnapshot();
  if (snapshot.length === 0) {
    throw new Error("Failed to select fee payer account from signer pool");
  }
  const nextPublicKey = snapshot[rrIndex % snapshot.length]?.publicKey;
  rrIndex = (rrIndex + 1) % snapshot.length;

  const account = config.feePayerAccounts.find(
    (candidate) => candidate.publicKey === nextPublicKey,
  );
  if (!account) {
    throw new Error("Failed to select fee payer account from signer pool");
  }
  return account;
}
