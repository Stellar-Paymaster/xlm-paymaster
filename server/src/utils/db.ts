import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { encryptionExtension } from "./prismaEncryption";

type PrismaClientLike = {
  [key: string]: any;
};

type PrismaModule = {
  PrismaClient: new (options?: {
    adapter?: any;
    log?: string[];
  }) => PrismaClientLike;
};

const globalForPrisma = globalThis as {
  prisma?: PrismaClientLike;
  replicaPrisma?: PrismaClientLike;
};

function loadPrismaClient(): PrismaModule["PrismaClient"] {
  try {
    const prismaModule = require("@prisma/client") as PrismaModule;
    return prismaModule.PrismaClient;
  } catch (error) {
    throw new Error(
      "Prisma client is unavailable. Run `npx prisma generate` before using database features.",
    );
  }
}

const PrismaClient = loadPrismaClient();

const logLevel =
  process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"];

// ── Primary client (writes + non-analytic reads) ────────────────────────────

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const adapter = new PrismaBetterSqlite3({ url: dbUrl });

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: logLevel,
  });

export const prisma =
  typeof basePrisma.$extends === "function"
    ? basePrisma.$extends(encryptionExtension)
    : basePrisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
}

// ── Read-replica client (heavy analytics / reporting queries) ───────────────
// When DATABASE_REPLICA_URL is set the replica client targets the read replica,
// offloading aggregation-heavy SELECT queries from the primary.
// Falls back to DATABASE_URL when no replica is configured (development, staging).

const replicaUrl = process.env.DATABASE_REPLICA_URL ?? dbUrl;
const replicaAdapter = new PrismaBetterSqlite3({ url: replicaUrl });

const baseReplicaPrisma =
  globalForPrisma.replicaPrisma ??
  new PrismaClient({
    adapter: replicaAdapter,
    log: logLevel,
  });

export const replicaDb =
  typeof baseReplicaPrisma.$extends === "function"
    ? baseReplicaPrisma.$extends(encryptionExtension)
    : baseReplicaPrisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.replicaPrisma = baseReplicaPrisma;
}

export default prisma;
