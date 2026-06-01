import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { SigningStargateClient, GasPrice, QueryClient, setupFeegrantExtension } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet, Registry } from "@cosmjs/proto-signing";
import { Tendermint37Client } from "@cosmjs/tendermint-rpc";
import { MsgGrantAllowance, MsgRevokeAllowance } from "cosmjs-types/cosmos/feegrant/v1beta1/tx";
import { BasicAllowance, PeriodicAllowance } from "cosmjs-types/cosmos/feegrant/v1beta1/feegrant";
import { Timestamp } from "cosmjs-types/google/protobuf/timestamp";
import { Duration } from "cosmjs-types/google/protobuf/duration";
import { Any } from "cosmjs-types/google/protobuf/any";
import prisma from "../utils/db";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "cosmosFeeGrant" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GranterRecord {
  id: string;
  chainId: string;
  name: string;
  rpcUrl: string;
  prefix: string;
  denom: string;
  enabled: boolean;
  granterAddress: string | null;
  hasMnemonic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnabledGranterSecretRecord extends GranterRecord {
  mnemonic: string | null;
}

export interface AllowanceRecord {
  id: string;
  granterId: string;
  granteeAddr: string;
  allowanceType: string;
  spendLimit: string | null;
  expiration: Date | null;
  periodSeconds: number | null;
  periodLimit: string | null;
  txHash: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GrantAllowanceInput {
  granteeAddr: string;
  allowanceType: "basic" | "periodic";
  spendLimit?: { denom: string; amount: string }[];
  expirationSeconds?: number;
  periodSeconds?: number;
  periodLimit?: { denom: string; amount: string }[];
}

// ---------------------------------------------------------------------------
// Encryption (same AES-256-GCM scheme as SignerSecret / ChainRegistry)
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const rawKey = process.env.FLUID_SIGNER_ENCRYPTION_KEY?.trim();
  if (!rawKey) {
    throw new Error("FLUID_SIGNER_ENCRYPTION_KEY is required to store granter mnemonics.");
  }
  return createHash("sha256").update(rawKey).digest();
}

function encryptMnemonic(mnemonic: string): {
  encryptedMnemonic: string;
  initializationVec: string;
  authTag: string;
} {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(mnemonic, "utf8"), cipher.final()]);
  return {
    encryptedMnemonic: encrypted.toString("base64"),
    initializationVec: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptMnemonic(row: {
  encryptedMnemonic: string | null;
  initializationVec: string | null;
  authTag: string | null;
}): string {
  if (!row.encryptedMnemonic || !row.initializationVec || !row.authTag) {
    throw new Error("Granter has no stored mnemonic");
  }
  const key = getEncryptionKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(row.initializationVec, "base64"),
  );
  decipher.setAuthTag(Buffer.from(row.authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(row.encryptedMnemonic, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// ---------------------------------------------------------------------------
// Prisma delegate helpers
// ---------------------------------------------------------------------------

function granterDelegate() {
  return (prisma as any).cosmosGranterConfig as any;
}

function allowanceDelegate() {
  return (prisma as any).cosmosFeeGrantAllowance as any;
}

function toPublicGranter(row: any): GranterRecord {
  return {
    id: row.id,
    chainId: row.chainId,
    name: row.name,
    rpcUrl: row.rpcUrl,
    prefix: row.prefix,
    denom: row.denom,
    enabled: row.enabled,
    granterAddress: row.granterAddress,
    hasMnemonic: Boolean(row.encryptedMnemonic),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Wallet helpers
// ---------------------------------------------------------------------------

async function getSigningClient(
  rpcUrl: string,
  mnemonic: string,
  prefix: string,
  denom: string,
): Promise<{ client: SigningStargateClient; address: string }> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
  const [account] = await wallet.getAccounts();
  const gasPrice = GasPrice.fromString(`0.025${denom}`);
  const client = await SigningStargateClient.connectWithSigner(rpcUrl, wallet, { gasPrice });
  return { client, address: account.address };
}

async function getQueryClient(rpcUrl: string) {
  const tmClient = await Tendermint37Client.connect(rpcUrl);
  return QueryClient.withExtensions(tmClient, setupFeegrantExtension);
}

// ---------------------------------------------------------------------------
// Granter CRUD
// ---------------------------------------------------------------------------

export async function listGranters(): Promise<GranterRecord[]> {
  const rows = await granterDelegate().findMany();
  return rows.map(toPublicGranter);
}

export async function listEnabledGrantersWithMnemonics(): Promise<EnabledGranterSecretRecord[]> {
  const rows = await granterDelegate().findMany();

  return rows
    .filter((row: any) => row.enabled)
    .map((row: any) => ({
      ...toPublicGranter(row),
      mnemonic:
        row.encryptedMnemonic && row.initializationVec && row.authTag
          ? decryptMnemonic(row)
          : null,
    }));
}

export async function getGranter(id: string): Promise<GranterRecord | null> {
  const row = await granterDelegate().findUnique({ where: { id } });
  return row ? toPublicGranter(row) : null;
}

export async function createGranter(input: {
  chainId: string;
  name: string;
  rpcUrl: string;
  prefix?: string;
  denom?: string;
  mnemonic?: string;
}): Promise<GranterRecord> {
  const existing = await granterDelegate().findUnique({ where: { chainId: input.chainId } });
  if (existing) {
    throw new Error(`Granter for chain "${input.chainId}" already exists`);
  }

  let secretFields: { encryptedMnemonic: string | null; initializationVec: string | null; authTag: string | null } = {
    encryptedMnemonic: null,
    initializationVec: null,
    authTag: null,
  };
  let granterAddress: string | null = null;

  if (input.mnemonic) {
    secretFields = encryptMnemonic(input.mnemonic);
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(input.mnemonic, {
      prefix: input.prefix ?? "cosmos",
    });
    const [account] = await wallet.getAccounts();
    granterAddress = account.address;
  }

  const row = await granterDelegate().create({
    data: {
      chainId: input.chainId,
      name: input.name,
      rpcUrl: input.rpcUrl,
      prefix: input.prefix ?? "cosmos",
      denom: input.denom ?? "uatom",
      enabled: false,
      granterAddress,
      ...secretFields,
    },
  });

  return toPublicGranter(row);
}

export async function updateGranter(
  id: string,
  input: {
    name?: string;
    rpcUrl?: string;
    prefix?: string;
    denom?: string;
    enabled?: boolean;
    mnemonic?: string;
  },
): Promise<GranterRecord> {
  const existing = await granterDelegate().findUnique({ where: { id } });
  if (!existing) throw new Error(`Granter not found: ${id}`);

  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.rpcUrl !== undefined) updateData.rpcUrl = input.rpcUrl;
  if (input.prefix !== undefined) updateData.prefix = input.prefix;
  if (input.denom !== undefined) updateData.denom = input.denom;
  if (input.enabled !== undefined) updateData.enabled = input.enabled;

  if (input.mnemonic !== undefined) {
    const encrypted = encryptMnemonic(input.mnemonic);
    updateData.encryptedMnemonic = encrypted.encryptedMnemonic;
    updateData.initializationVec = encrypted.initializationVec;
    updateData.authTag = encrypted.authTag;

    const prefix = input.prefix ?? existing.prefix;
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(input.mnemonic, { prefix });
    const [account] = await wallet.getAccounts();
    updateData.granterAddress = account.address;
  }

  const row = await granterDelegate().update({ where: { id }, data: updateData });
  logger.info({ chainId: row.chainId, enabled: row.enabled }, "Cosmos granter updated");
  return toPublicGranter(row);
}

export async function deleteGranter(id: string): Promise<void> {
  const existing = await granterDelegate().findUnique({ where: { id } });
  if (!existing) throw new Error(`Granter not found: ${id}`);
  await granterDelegate().delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Fee Grant Operations
// ---------------------------------------------------------------------------

export async function grantAllowance(
  granterId: string,
  input: GrantAllowanceInput,
): Promise<AllowanceRecord> {
  const granter = await granterDelegate().findUnique({ where: { id: granterId } });
  if (!granter) throw new Error(`Granter not found: ${granterId}`);
  if (!granter.enabled) throw new Error("Granter is not enabled");

  const mnemonic = decryptMnemonic(granter);
  const { client, address } = await getSigningClient(
    granter.rpcUrl,
    mnemonic,
    granter.prefix,
    granter.denom,
  );

  let allowanceValue: Uint8Array;
  let allowanceTypeUrl: string;
  const expiration = input.expirationSeconds
    ? Timestamp.fromPartial({
        seconds: BigInt(Math.floor(Date.now() / 1000) + input.expirationSeconds),
        nanos: 0,
      })
    : undefined;

  if (input.allowanceType === "periodic" && input.periodSeconds && input.periodLimit) {
    allowanceTypeUrl = "/cosmos.feegrant.v1beta1.PeriodicAllowance";
    allowanceValue = PeriodicAllowance.encode(
      PeriodicAllowance.fromPartial({
        basic: {
          spendLimit: input.spendLimit ?? [],
          expiration,
        },
        period: Duration.fromPartial({ seconds: BigInt(input.periodSeconds), nanos: 0 }),
        periodSpendLimit: input.periodLimit,
        periodCanSpend: input.periodLimit,
        periodReset: Timestamp.fromPartial({
          seconds: BigInt(Math.floor(Date.now() / 1000) + input.periodSeconds),
          nanos: 0,
        }),
      }),
    ).finish();
  } else {
    allowanceTypeUrl = "/cosmos.feegrant.v1beta1.BasicAllowance";
    allowanceValue = BasicAllowance.encode(
      BasicAllowance.fromPartial({
        spendLimit: input.spendLimit ?? [],
        expiration,
      }),
    ).finish();
  }

  const msg = {
    typeUrl: "/cosmos.feegrant.v1beta1.MsgGrantAllowance",
    value: MsgGrantAllowance.fromPartial({
      granter: address,
      grantee: input.granteeAddr,
      allowance: Any.fromPartial({
        typeUrl: allowanceTypeUrl,
        value: allowanceValue,
      }),
    }),
  };

  const result = await client.signAndBroadcast(address, [msg], "auto");
  if (result.code !== 0) {
    throw new Error(`FeeGrant tx failed: code=${result.code} log=${result.rawLog}`);
  }

  logger.info(
    { chainId: granter.chainId, grantee: input.granteeAddr, txHash: result.transactionHash },
    "Fee grant allowance issued",
  );

  const expirationDate = input.expirationSeconds
    ? new Date(Date.now() + input.expirationSeconds * 1000)
    : null;

  const row = await allowanceDelegate().upsert({
    where: {
      granterId_granteeAddr: { granterId, granteeAddr: input.granteeAddr },
    },
    update: {
      allowanceType: input.allowanceType,
      spendLimit: input.spendLimit ? JSON.stringify(input.spendLimit) : null,
      expiration: expirationDate,
      periodSeconds: input.periodSeconds ?? null,
      periodLimit: input.periodLimit ? JSON.stringify(input.periodLimit) : null,
      txHash: result.transactionHash,
      status: "active",
    },
    create: {
      granterId,
      granteeAddr: input.granteeAddr,
      allowanceType: input.allowanceType,
      spendLimit: input.spendLimit ? JSON.stringify(input.spendLimit) : null,
      expiration: expirationDate,
      periodSeconds: input.periodSeconds ?? null,
      periodLimit: input.periodLimit ? JSON.stringify(input.periodLimit) : null,
      txHash: result.transactionHash,
      status: "active",
    },
  });

  client.disconnect();
  return row;
}

export async function revokeAllowance(
  granterId: string,
  granteeAddr: string,
): Promise<AllowanceRecord> {
  const granter = await granterDelegate().findUnique({ where: { id: granterId } });
  if (!granter) throw new Error(`Granter not found: ${granterId}`);

  const mnemonic = decryptMnemonic(granter);
  const { client, address } = await getSigningClient(
    granter.rpcUrl,
    mnemonic,
    granter.prefix,
    granter.denom,
  );

  const msg = {
    typeUrl: "/cosmos.feegrant.v1beta1.MsgRevokeAllowance",
    value: MsgRevokeAllowance.fromPartial({
      granter: address,
      grantee: granteeAddr,
    }),
  };

  const result = await client.signAndBroadcast(address, [msg], "auto");
  if (result.code !== 0) {
    throw new Error(`Revoke tx failed: code=${result.code} log=${result.rawLog}`);
  }

  logger.info(
    { chainId: granter.chainId, grantee: granteeAddr, txHash: result.transactionHash },
    "Fee grant allowance revoked",
  );

  const row = await allowanceDelegate().update({
    where: {
      granterId_granteeAddr: { granterId, granteeAddr },
    },
    data: { status: "revoked", txHash: result.transactionHash },
  });

  client.disconnect();
  return row;
}

export async function listAllowances(
  granterId: string,
  status?: string,
): Promise<AllowanceRecord[]> {
  const where: Record<string, unknown> = { granterId };
  if (status) where.status = status;
  return allowanceDelegate().findMany({ where, orderBy: { createdAt: "desc" } });
}

export async function queryOnChainAllowances(granterId: string): Promise<any[]> {
  const granter = await granterDelegate().findUnique({ where: { id: granterId } });
  if (!granter || !granter.granterAddress) throw new Error("Granter not found or no address");

  const queryClient = await getQueryClient(granter.rpcUrl);
  const result = await queryClient.feegrant.allowances(granter.granterAddress);
  return result.allowances;
}
