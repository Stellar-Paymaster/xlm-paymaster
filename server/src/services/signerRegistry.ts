import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import StellarSdk from "@stellar/stellar-sdk";
import { Config, FeePayerAccount } from "../config";
import prisma from "../utils/db";

export type AdminSignerStatus = "Active" | "Low Balance" | "Sequence Error" | "Inactive";
export type AdminSignerSource = "env" | "db" | "vault";

export interface AdminSignerRecord {
  publicKey: string;
  balance: string | null;
  inFlight: number;
  totalUses: number;
  sequenceNumber: string | null;
  status: AdminSignerStatus;
  source: AdminSignerSource;
  canRemove: boolean;
}

interface PersistedSignerRecord {
  publicKey: string;
  encryptedSecret: string;
  initializationVec: string;
  authTag: string;
}

function getSignerSecretDelegate() {
  return (prisma as any).signerSecret as {
    create(args: { data: PersistedSignerRecord }): Promise<unknown>;
    delete(args: { where: { publicKey: string } }): Promise<unknown>;
    findMany(): Promise<PersistedSignerRecord[]>;
    findUnique(args: { where: { publicKey: string } }): Promise<PersistedSignerRecord | null>;
  };
}

function getEncryptionKey(): Buffer {
  const rawKey = process.env.PAYMASTER_SIGNER_ENCRYPTION_KEY?.trim();
  if (!rawKey) {
    throw new Error(
      "PAYMASTER_SIGNER_ENCRYPTION_KEY is required to persist signer secrets in the database.",
    );
  }

  return createHash("sha256").update(rawKey).digest();
}

function encryptSecret(secret: string): Omit<PersistedSignerRecord, "publicKey"> {
  const key = getEncryptionKey();
  const initializationVec = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, initializationVec);
  const encryptedSecret = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);

  return {
    encryptedSecret: encryptedSecret.toString("base64"),
    initializationVec: initializationVec.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptSecret(record: PersistedSignerRecord): string {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(record.initializationVec, "base64"),
  );
  decipher.setAuthTag(Buffer.from(record.authTag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(record.encryptedSecret, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

function accountSource(account: FeePayerAccount): AdminSignerSource {
  if (account.secretSource.type === "vault") {
    return "vault";
  }

  if (account.secretSource.type === "db") {
    return "db";
  }

  return "env";
}

function mapStatus(value: string): AdminSignerStatus {
  switch (value) {
    case "low_balance":
      return "Low Balance";
    case "sequence_error":
      return "Sequence Error";
    case "inactive":
      return "Inactive";
    default:
      return "Active";
  }
}

function formatBalance(value: bigint | null): string | null {
  if (value === null) {
    return null;
  }

  const stroops = Number(value);
  if (!Number.isFinite(stroops)) {
    return null;
  }

  return `${(stroops / 10_000_000).toFixed(2)} XLM`;
}

async function loadNativeAccountHealth(
  config: Config,
  publicKey: string,
): Promise<{ balance: string | null; sequenceNumber: string | null }> {
  if (!config.horizonUrl) {
    return { balance: null, sequenceNumber: null };
  }

  const horizon = new StellarSdk.Horizon.Server(config.horizonUrl);
  const account = await horizon.loadAccount(publicKey);
  const nativeBalance = account.balances.find(
    (balance: { asset_type: string; balance?: string }) => balance.asset_type === "native",
  );
  const balance = nativeBalance?.balance ?? null;

  return {
    balance,
    sequenceNumber: account.sequence,
  };
}

export async function hydratePersistedSigners(config: Config): Promise<void> {
  const delegate = getSignerSecretDelegate();
  const records = await delegate.findMany();

  for (const record of records) {
    if (config.feePayerAccounts.some((account) => account.publicKey === record.publicKey)) {
      continue;
    }

    const secret = decryptSecret(record);
    const keypair = StellarSdk.Keypair.fromSecret(secret);
    await config.signerPool.addAccount({ keypair, secret });
    config.feePayerAccounts.push({
      publicKey: keypair.publicKey(),
      keypair,
      secretSource: { type: "db", encrypted: true },
    });
  }
}

export async function refreshSignerPoolHealth(config: Config): Promise<void> {
  await Promise.all(
    config.feePayerAccounts.map(async (account) => {
      try {
        const health = await loadNativeAccountHealth(config, account.publicKey);
        if (health.balance !== null) {
          const stroops = BigInt(Math.round(Number(health.balance) * 10_000_000));
          await config.signerPool.updateBalance(account.publicKey, stroops);
        }
        await config.signerPool.updateSequenceNumber(account.publicKey, health.sequenceNumber);
      } catch (error) {
        await config.signerPool.markSequenceError(account.publicKey);
      }
    }),
  );
}

export async function listAdminSigners(config: Config): Promise<AdminSignerRecord[]> {
  await refreshSignerPoolHealth(config);

  const snapshot = config.signerPool.getSnapshot();

  return snapshot.map((account) => {
    const feePayerAccount = config.feePayerAccounts.find(
      (candidate) => candidate.publicKey === account.publicKey,
    );
    const source = feePayerAccount ? accountSource(feePayerAccount) : "env";

    return {
      publicKey: account.publicKey,
      balance: formatBalance(account.balance ? BigInt(account.balance) : null),
      inFlight: account.inFlight,
      totalUses: account.totalUses,
      sequenceNumber: account.sequenceNumber,
      status: mapStatus(account.status),
      source,
      canRemove: source === "db",
    };
  });
}

export async function addSignerToRegistry(
  config: Config,
  secret: string,
): Promise<AdminSignerRecord> {
  const keypair = StellarSdk.Keypair.fromSecret(secret);
  const publicKey = keypair.publicKey();

  if (config.feePayerAccounts.some((account) => account.publicKey === publicKey)) {
    throw new Error(`Signer already exists: ${publicKey}`);
  }

  const delegate = getSignerSecretDelegate();
  const existing = await delegate.findUnique({ where: { publicKey } });
  if (existing) {
    throw new Error(`Signer already exists: ${publicKey}`);
  }

  const encrypted = encryptSecret(secret);
  await delegate.create({
    data: {
      publicKey,
      ...encrypted,
    },
  });

  await config.signerPool.addAccount({ keypair, secret });
  config.feePayerAccounts.push({
    publicKey,
    keypair,
    secretSource: { type: "db", encrypted: true },
  });

  await refreshSignerPoolHealth(config);

  const signer = (await listAdminSigners(config)).find((account) => account.publicKey === publicKey);
  if (!signer) {
    throw new Error("Failed to load signer after creation");
  }

  return signer;
}

export async function removeSignerFromRegistry(
  config: Config,
  publicKey: string,
): Promise<void> {
  const account = config.feePayerAccounts.find((candidate) => candidate.publicKey === publicKey);
  if (!account) {
    throw new Error(`Unknown signer account: ${publicKey}`);
  }

  if (account.secretSource.type !== "db") {
    throw new Error("Only database-backed signers can be removed from the UI");
  }

  const delegate = getSignerSecretDelegate();
  await delegate.delete({ where: { publicKey } });
  await config.signerPool.removeAccount(publicKey);

  const nextAccounts = config.feePayerAccounts.filter((candidate) => candidate.publicKey !== publicKey);
  config.feePayerAccounts.length = 0;
  config.feePayerAccounts.push(...nextAccounts);
}
