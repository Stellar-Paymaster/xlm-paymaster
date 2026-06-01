import "dotenv/config";
import { createLogger, serializeError } from "../src/utils/logger";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { randomBytes, createHash } from "crypto";

const dbUrl = process.env["DATABASE_URL"] ?? "file:./dev.db";
const adapter = new PrismaBetterSqlite3({ url: dbUrl });
const prisma = new PrismaClient({ adapter });
const logger = createLogger({ component: "prisma_seed" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _seed = 0xdeadbeef;
function rand(): number {
  _seed ^= _seed << 13;
  _seed ^= _seed >> 17;
  _seed ^= _seed << 5;
  return ((_seed >>> 0) / 0xffffffff);
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function fakeHash(prefix = ""): string {
  return (prefix + randomBytes(32).toString("hex")).slice(0, 64);
}

function makeApiKey(prefix: string): string {
  const hash = createHash("sha256")
    .update(randomBytes(16))
    .digest("hex")
    .slice(0, 32);
  return `${prefix}_${hash}`;
}

function dateWithin(daysAgo: number, spreadDays = 1): Date {
  const now = Date.now();
  const base = now - daysAgo * 86_400_000;
  return new Date(base + rand() * spreadDays * 86_400_000);
}

// ---------------------------------------------------------------------------
// Static reference data
// ---------------------------------------------------------------------------

const TENANT_CONFIGS = [
  {
    id: "tenant-demo-acme",
    name: "Acme DeFi",
    tier: "Pro" as const,
    webhookUrl: "https://acme-defi.example.com/webhooks/fluid",
    webhookSecret: "whsec_acme_defi_secret_abc123",
    webhookEventTypes: "transaction.success,transaction.failed",
    dailyQuotaStroops: BigInt(50_000_000),
  },
  {
    id: "tenant-demo-nova",
    name: "Nova Payments",
    tier: "Enterprise" as const,
    webhookUrl: "https://nova-payments.example.io/api/fluid-events",
    webhookSecret: "whsec_nova_payments_secret_xyz789",
    webhookEventTypes: "transaction.success,transaction.failed,quota.exceeded",
    dailyQuotaStroops: BigInt(500_000_000),
  },
  {
    id: "tenant-demo-pebble",
    name: "Pebble Wallet",
    tier: "Free" as const,
    webhookUrl: "https://pebble.wallet/hooks/fluid",
    webhookSecret: "whsec_pebble_wallet_secret_def456",
    webhookEventTypes: "transaction.success",
    dailyQuotaStroops: BigInt(1_000_000),
  },
] as const;

const TX_CATEGORIES = ["Payment", "Token Swap", "NFT Transfer", "Smart Contract", "Other"];
const TX_CHAINS = ["stellar", "evm", "solana", "cosmos"];
const TX_STATUSES = ["SUCCESS", "SUCCESS", "SUCCESS", "FAILED", "PENDING"];
const WEBHOOK_STATUSES = ["success", "success", "success", "failed", "pending"];

const SAMPLE_WEBHOOK_PAYLOADS = [
  (txId: string) =>
    JSON.stringify({ event: "transaction.success", transactionId: txId, ts: new Date().toISOString() }),
  (txId: string) =>
    JSON.stringify({ event: "transaction.failed", transactionId: txId, reason: "insufficient_fee", ts: new Date().toISOString() }),
  (txId: string) =>
    JSON.stringify({ event: "quota.exceeded", transactionId: txId, ts: new Date().toISOString() }),
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  logger.info("Seeding database with initial data");

  // ── 1. Subscription tiers ─────────────────────────────────────────────────
  const tiers = await Promise.all([
    prisma.subscriptionTier.upsert({
      where: { name: "Free" },
      update: { txLimit: 10, rateLimit: 5, priceMonthly: 0 },
      create: { id: "tier-free", name: "Free", txLimit: 1"Pro" },
      update: { txLimit: 1000, rateLimit: 60, priceMonthly: 4900 },
      create: { id: "tier-pro", name: "Pro", txLimit: 1000, rateLimit: 60, priceMonthly: 4900 },
    }),
    prisma.subscriptionTier.upsert({
      where: { name: "Enterprise" },
      update: { txLimit: 100000, rateLimit: 300, priceMonthly: 19900 },
      create: { id: "tier-enterprise", name: "Enterprise", txLimit: 100000, rateLimit: 300, priceMonthly: 19900 },
    }),
  ]);
  logger.info({ tier_count: tiers.length }, "Upserted subscription tiers");

  const tierMap = Object.fromEntries(tiers.map((t) => [t.name, t]));
  const freeTier = tierMap["Free"];
  if (!freeTier) throw new Error("Free tier was not seeded");

  // ── 2. Legacy test tenants (keep existing data intact) ────────────────────
  await Promise.all([
    prisma.tenant.upsert({
      where: { id: "tenant-test-001" },
      update: { name: "Test Tenant 1", subscriptionTierId: freeTier.id },
      create: { id: "tenant-test-rId: freeTier.id },
    }),
    prisma.tenant.upsert({
      where: { id: "tenant-test-002" },
      update: { name: "Development Tenant", subscriptionTierId: freeTier.id },
      create: { id: "tenant-test-002", name: "Development Tenant", subscriptionTierId: freeTier.id },
    }),
  ]);

  await Promise.all([
    prisma.apiKey.upsert({
      where: { key: "test-api-key-001" },
      update: { tenantId: "tenant-test-001", prefix: "test", name: "Primary Test Key", maxRequests: freeTier.rateLimit, tier: "free" },
      create: { key: "test-api-key-001", prefix: "test", name: "Primary Test Key", tenantId: "tenant-test-001", maxRequests: freeTier.rateLimit, tier: "free" },
    }),
    prisma.apiKey.upsert({
      where: { key: "test-api-key-002" },
      update: { tenantId: "tenant-test-002", prefix: "test", name: "Development Key", maxRequests: freeTier.rateLimit, tier: "free" },
      create: { key: "test-api-key-002", prefix: "test", name: "Development Key", tenantId: "tenant-test-002", maxRequests: freeTier.rateLimit, tier: "free" },
    }),
  ]);

  // ── 3. Demo tenants (3 tenants, 2 API keys each) ──────────────────────────
  const demoTenants = await Promise.all(
    TENANT_CONFIGS.map((cfg) =>
      prisma.tenant.upsert({
        where: { id: cfg.id },
        update: {
          name: cfg.name,
          subscriptionTierId: tierMap[cfg.tier].id,
          webhookUrl: cfg.webhookUrl,
          webhookSecret: cfg.webhookSecret,
          webhookEventTypes: cfg.webhookEventTypes,
          dailyQuotaStroops: cfg.dailyQuotaStroops,
        },
        create: {
          id: cfg.id,
          name: cfg.name,
          subscriptionTierId: tierMap[cfg.tier].id,
          webhookUrl: cfg.webhookUrl,
          webhookSecret: cfg.webhookSecret,
          webhookEventTypes: cfg.webhookEventTypes,
          dailyQuotaStroops: cfg.dailyQuotaStroops,
        },
      })
    )
  );
  logger.info({ tenant_count: demoTenants.length }, "Upserted demo tenants");

  NT_CONFIGS.flatMap((cfg, i) => {
    const tenant = demoTenants[i];
    const tierName = cfg.tier.toLowerCase();
    const prefix = cfg.name.split(" ")[0].toLowerCase();
    return [
      {
        key: makeApiKey(prefix),
        prefix,
        name: "Production Key",
        tenantId: tenant.id,
        maxRequests: tierMap[cfg.tier].rateLimit,
        tier: tierName,
        active: true,
        allowedChains: "stellar,evm,solana,cosmos",
      },
      {
        key: makeApiKey(`${prefix}_sandbox`),
        prefix: `${prefix}_sandbox`,
        name: "Sandbox Key",
        tenantId: tenant.id,
        maxRequests: 10,
        tier: tierName,
        active: true,
        isSandbox: true,
        allowedChains: "stellar",
      },
    ];
  });

  await Promise.all(
    apiKeyPairs.map((k) =>
      prisma.apiKey.upsert({
        where: { key: k.key },
        update: k,
        create: k,
      })
    )
  );
  logger.info({ api_key_count: apiKeyPairs.length }, "Created demo API keys (2 per tenant)");

  // ── 4. 1,000 transactions spread over 30 days ─────────────────────────────
  const TOTAL_TX = 1000;
  const tenantIds = demoTenants.map((t) => t.id);

  await prisma.transaction.deleteMany({ where: { tenantId: { in: tenantIds } } });

  const txBatch: any[] = [];
  for (let i = 0; i < TOTAL_TX; i++) {
    const daysAgo = rand() * 30;
    const createdAt = dateWithin(daysAgo, 0);
    const status = pick(TX_STATUSES);

    txBatch.push({
      tenantId: pick(tenantIds),
      txHash: status !== "PENDING" ? fakeHash("tx") : null,
      innerTxHash: fakeHash("inner"),
      status,
      costStroops: BigInt(randInt(100, 500_000)),
      category: pick(TX_CATEGORIES),
      chain: pick(TX_CHAINS),
      createdAt,
    });
  }

  const BATCH_SIZE = 100;
  for (let i = 0; i < txBatch.length; i += BATCH_SIZE) {
    await prisma.transaction.createMany({ data: txBatch.slice(i, i + BATCH_SIZE) });
  }
  logger.info({ tx_count: TOTAL_TX }, "Created 1,000k delivery logs ───────────────────────────────────────────────
  const createdTxIds = await prisma.transaction.findMany({
    where: { tenantId: { in: tenantIds } },
    select: { id: true, tenantId: true },
  });

  await prisma.webhookDelivery.deleteMany({ where: { tenantId: { in: tenantIds } } });

  const deliveryBatch: any[] = [];
  for (const tx of createdTxIds) {
    const cfg = TENANT_CONFIGS.find((c) => c.id === tx.tenantId);
    if (!cfg?.webhookUrl) continue;

    const numDeliveries = randInt(1, 4);
    for (let d = 0; d < numDeliveries; d++) {
      const status = pick(WEBHOOK_STATUSES);
      const retryCount = status === "failed" ? randInt(1, 3) : 0;
      const payloadFn = pick(SAMPLE_WEBHOOK_PAYLOADS);

      deliveryBatch.push({
        tenantId: tx.tenantId,
        url: cfg.webhookUrl,
        payload: payloadFn(tx.id),
        status,
        retryCount,
        lastError: status === "failed"
    : null,
        nextAttempt: status === "failed"
          ? new Date(Date.now() + randInt(60_000, 3_600_000))
          : null,
        createdAt: new Date(),
      });
    }
  }

  for (let i = 0; i < deliveryBatch.length; i += BATCH_SIZE) {
    await prisma.webhookDelivery.createMany({ data: deliveryBatch.slice(i, i + BATCH_SIZE) });
  }
  logger.info({ delivery_count: deliveryBatch.length }, "Created webhook delivery logs");

  // ── 6. SpendBaseline per demo tenant ──────────────────────────────────────
  for (const tenant of demoTenants) {
    const tenantTxs = txBatch.filter((t) => t.tenantId === tenant.id);
    const totalStroops = tenantTxs.reduce((acc, t) => acc + Number(t.costStroops), 0);
    const dailyAvg = BigInt(Math.round(totalStroops / 30));
    const hourlyAvg = BigInt(Math.round(totalStroops / (30 * 24)));

    await prisma.spendBaseline.upsert({
      where: { tenantId: tenant.id },
      update: { dailylength, lastUpdated: new Date() },
      create: { tenantId: tenant.id, dailyAvgStroops: dailyAvg, hourlyAvgStroops: hourlyAvg, totalTransactions: tenantTxs.length, lastUpdated: new Date() },
    });
  }
  logger.info({ tenant_count: demoTenants.length }, "Upserted spend baselines");

  // ── Summary ───────────────────────────────────────────────────────────────
  logger.info(
    {
      tiers: tiers.length,
      demo_tenants: demoTenants.length,
      api_keys: apiKeyPairs.length,
      transactions: TOTAL_TX,
      webhook_deliveries: deliveryBatch.length,
    },
    "✅ Seeding complete"
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    logger.error({ ...serializeError(e) }, "Seeding failed");
    await prisma.$disconnect();
    process.exit(1);
  });
