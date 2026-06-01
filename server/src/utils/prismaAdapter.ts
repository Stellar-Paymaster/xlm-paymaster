import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

export function createPrismaAdapter(url: string): any {
  const normalizedUrl = url.trim().toLowerCase();

  if (
    normalizedUrl.startsWith("postgresql://") ||
    normalizedUrl.startsWith("postgres://")
  ) {
    return new PrismaPg({ connectionString: url });
  }

  return new PrismaBetterSqlite3({ url });
}
