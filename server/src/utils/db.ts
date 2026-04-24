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

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const adapter = new PrismaBetterSqlite3({ url: dbUrl });

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

export const prisma = typeof basePrisma.$extends === "function" ? basePrisma.$extends(encryptionExtension) : basePrisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
}

export default prisma;
