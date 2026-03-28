import StellarSdk from "@stellar/stellar-sdk";
import { SignerPool } from "./signing";

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
  token?: string;
  appRole?: {
    roleId: string;
    secretId: string;
  };
  kvMount: string;
  kvVersion: 1 | 2;
  secretField: string;
}

export interface SupportedAsset {
  code: string;
  issuer?: string;
  minBalance?: string;
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

export interface Config {
  feePayerAccounts: FeePayerAccount[];
  signerPool: SignerPool;
  baseFee: number;
  feeMultiplier: number;
  networkPassphrase: string;
  horizonUrl?: string;
  horizonUrls: string[];
  horizonSelectionStrategy: HorizonSelectionStrategy;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  allowedOrigins: string[];
  alerting: AlertingConfig;
  digest: DigestConfig;
  supportedAssets?: SupportedAsset[];
  maxXdrSize: number;
  maxOperations: number;
  stellarRpcUrl?: string;
  vault?: VaultConfig;
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
  const supportedAssets = parseSupportedAssets(
    process.env.FLUID_SUPPORTED_ASSETS,
  );

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
    rateLimitMax,
    rateLimitWindowMs,
    stellarRpcUrl: process.env.STELLAR_RPC_URL?.trim() || undefined,
    supportedAssets,
    vault,
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
    signerPool: new SignerPool(
      feePayerAccounts.map((account) => ({
        keypair: account.keypair,
        secret:
          account.secretSource.type === "env"
            ? account.secretSource.secret
            : "",
      })),
    ),
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
