import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

type PrismaClientLike = {
  [key: string]: any;
};

type PrismaModule = {
  PrismaClient: new (options?: {
    adapter?: any;
    log?: string[];
  }) => PrismaClientLike;
};

function loadPrismaClient(): PrismaModule["PrismaClient"] {
  try {
    const prismaModule = require("@prisma/client") as PrismaModule;
    return prismaModule.PrismaClient;
  } catch {
    throw new Error(
      "Prisma client is unavailable. Run `npx prisma generate` before using database features."
    );
  }
}

const PrismaClient = loadPrismaClient();

/**
 * Read-only replica Prisma client for analytics queries.
 *
 * When READ_REPLICA_URL is set, this client targets a dedicated read replica
 * so analytical reads do not contend with writes on the primary. Falls back to
 * DATABASE_URL (or the local dev file) when no replica is configured.
 *
 * Usage: import readPrisma from "./readDb" and use it for SELECT-only handlers
 * such as spend forecasts, audit log views, and transaction analytics.
 */
const replicaUrl =
  process.env.READ_REPLICA_URL ??
  process.env.DATABASE_URL ??
  "file:./dev.db";

const adapter = new PrismaBetterSqlite3({ url: replicaUrl });

export const readPrisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
});

export default readPrisma;
