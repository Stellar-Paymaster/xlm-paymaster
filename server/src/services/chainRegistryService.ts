import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import prisma from "../utils/db";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "chainRegistryService" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChainRecord {
  id: string;
  chainId: string;
  name: string;
  rpcUrl: string;
  enabled: boolean;
  hasFeePayerSecret: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnabledChainSecretRecord extends ChainRecord {
  feePayerSecret: string | null;
}

interface PersistedChain {
  id: string;
  chainId: string;
  name: string;
  rpcUrl: string;
  enabled: boolean;
  encryptedSecret: string | null;
  initializationVec: string | null;
  authTag: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Encryption helpers (AES-256-GCM, same scheme as SignerSecret)
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const rawKey = process.env.FLUID_SIGNER_ENCRYPTION_KEY?.trim();
  if (!rawKey) {
    throw new Error(
      "FLUID_SIGNER_ENCRYPTION_KEY is required to store chain fee-payer secrets.",
    );
  }
  return createHash("sha256").update(rawKey).digest();
}

function encryptSecret(
  secret: string,
): { encryptedSecret: string; initializationVec: string; authTag: string } {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedSecret: encrypted.toString("base64"),
    initializationVec: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptChainSecret(chain: PersistedChain): string {
  if (!chain.encryptedSecret || !chain.initializationVec || !chain.authTag) {
    throw new Error(`Chain "${chain.chainId}" has no stored fee-payer secret`);
  }
  const key = getEncryptionKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(chain.initializationVec, "base64"),
  );
  decipher.setAuthTag(Buffer.from(chain.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(chain.encryptedSecret, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// ---------------------------------------------------------------------------
// Prisma delegate helper
// ---------------------------------------------------------------------------

function getDelegate() {
  return (prisma as any).chainRegistry as {
    findMany(): Promise<PersistedChain[]>;
    findUnique(args: { where: { id?: string; chainId?: string } }): Promise<PersistedChain | null>;
    create(args: { data: Omit<PersistedChain, "id" | "createdAt" | "updatedAt"> }): Promise<PersistedChain>;
    update(args: { where: { id: string }; data: Partial<Omit<PersistedChain, "id" | "createdAt">> }): Promise<PersistedChain>;
    delete(args: { where: { id: string } }): Promise<PersistedChain>;
  };
}

function toPublicRecord(chain: PersistedChain): ChainRecord {
  return {
    id: chain.id,
    chainId: chain.chainId,
    name: chain.name,
    rpcUrl: chain.rpcUrl,
    enabled: chain.enabled,
    hasFeePayerSecret: Boolean(chain.encryptedSecret),
    createdAt: chain.createdAt,
    updatedAt: chain.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// RPC reachability check
// ---------------------------------------------------------------------------

export async function validateRpcUrl(rpcUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rpcUrl);
  } catch {
    throw new Error(`Invalid URL format: "${rpcUrl}"`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`RPC URL must use http or https, got "${url.protocol}"`);
  }

  // Try fetching the root/health of the Horizon or RPC endpoint.
  // Horizon returns 200 with a JSON body at its base URL.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(rpcUrl.replace(/\/$/, ""), {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (response.status >= 500) {
      throw new Error(
        `RPC endpoint returned server error (HTTP ${response.status})`,
      );
    }
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") {
      throw new Error(`RPC URL timed out after 8 s: "${rpcUrl}"`);
    }
    throw new Error(
      `RPC URL unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listChains(): Promise<ChainRecord[]> {
  const rows = await getDelegate().findMany();
  return rows.map(toPublicRecord);
}

export async function getChain(id: string): Promise<ChainRecord | null> {
  const row = await getDelegate().findUnique({ where: { id } });
  return row ? toPublicRecord(row) : null;
}

export async function createChain(input: {
  chainId: string;
  name: string;
  rpcUrl: string;
  feePayerSecret?: string;
}): Promise<ChainRecord> {
  const existing = await getDelegate().findUnique({
    where: { chainId: input.chainId },
  });
  if (existing) {
    throw new Error(`Chain with chainId "${input.chainId}" already exists`);
  }

  let secretFields: {
    encryptedSecret: string | null;
    initializationVec: string | null;
    authTag: string | null;
  } = { encryptedSecret: null, initializationVec: null, authTag: null };

  if (input.feePayerSecret) {
    secretFields = encryptSecret(input.feePayerSecret);
  }

  const row = await getDelegate().create({
    data: {
      chainId: input.chainId,
      name: input.name,
      rpcUrl: input.rpcUrl,
      enabled: false,
      ...secretFields,
    },
  });

  return toPublicRecord(row);
}

export async function updateChain(
  id: string,
  input: {
    name?: string;
    rpcUrl?: string;
    enabled?: boolean;
    feePayerSecret?: string;
  },
): Promise<ChainRecord> {
  const existing = await getDelegate().findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Chain not found: ${id}`);
  }

  // If enabling, validate that the RPC URL is reachable.
  if (input.enabled === true) {
    const urlToCheck = input.rpcUrl ?? existing.rpcUrl;
    await validateRpcUrl(urlToCheck);
  }

  const updateData: Partial<Omit<PersistedChain, "id" | "createdAt">> = {};

  if (input.name !== undefined) updateData.name = input.name;
  if (input.rpcUrl !== undefined) updateData.rpcUrl = input.rpcUrl;
  if (input.enabled !== undefined) updateData.enabled = input.enabled;

  if (input.feePayerSecret !== undefined) {
    const encrypted = encryptSecret(input.feePayerSecret);
    updateData.encryptedSecret = encrypted.encryptedSecret;
    updateData.initializationVec = encrypted.initializationVec;
    updateData.authTag = encrypted.authTag;
  }

  const updated = await getDelegate().update({
    where: { id },
    data: updateData,
  });

  logger.info(
    { chainId: updated.chainId, enabled: updated.enabled },
    "Chain updated",
  );

  return toPublicRecord(updated);
}

export async function deleteChain(id: string): Promise<void> {
  const existing = await getDelegate().findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Chain not found: ${id}`);
  }
  await getDelegate().delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Hot-reload: cache of enabled chains, refreshed on interval
// ---------------------------------------------------------------------------

let enabledChainCache: ChainRecord[] = [];
let reloadTimer: ReturnType<typeof setInterval> | null = null;

async function reloadEnabledChains(): Promise<void> {
  try {
    const all = await getDelegate().findMany();
    enabledChainCache = all
      .filter((c) => c.enabled)
      .map(toPublicRecord);
    logger.debug(
      { count: enabledChainCache.length },
      "Chain registry reloaded",
    );
  } catch (error) {
    logger.error({ error }, "Failed to reload chain registry");
  }
}

export function startChainRegistryHotReload(intervalMs?: number): void {
  const ms =
    intervalMs ??
    Number(process.env.CHAIN_RELOAD_INTERVAL_MS ?? "60000");

  void reloadEnabledChains();

  if (reloadTimer) {
    clearInterval(reloadTimer);
  }

  reloadTimer = setInterval(() => {
    void reloadEnabledChains();
  }, ms);

  logger.info({ intervalMs: ms }, "Chain registry hot-reload started");
}

export function stopChainRegistryHotReload(): void {
  if (reloadTimer) {
    clearInterval(reloadTimer);
    reloadTimer = null;
  }
}

export function getEnabledChains(): ChainRecord[] {
  return enabledChainCache;
}

export async function listEnabledChainsWithSecrets(): Promise<EnabledChainSecretRecord[]> {
  const rows = await getDelegate().findMany();

  return rows
    .filter((row) => row.enabled)
    .map((row) => ({
      ...toPublicRecord(row),
      feePayerSecret:
        row.encryptedSecret && row.initializationVec && row.authTag
          ? decryptChainSecret(row)
          : null,
    }));
}
