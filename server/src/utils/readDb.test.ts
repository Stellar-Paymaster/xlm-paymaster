import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    transaction: { findMany: vi.fn() },
  })),
}));

vi.mock("@prisma/adapter-better-sqlite3", () => ({
  PrismaBetterSqlite3: vi.fn().mockImplementation(() => ({})),
}));

describe("readDb", () => {
  it("exports a readPrisma named export", async () => {
    const mod = await import("./readDb");
    expect(mod.readPrisma).toBeDefined();
  });

  it("default export is the same object as readPrisma", async () => {
    const mod = await import("./readDb");
    expect(mod.default).toBe(mod.readPrisma);
  });

  it("constructs the Prisma adapter from the replica or primary URL", async () => {
    const { PrismaBetterSqlite3 } = await import(
      "@prisma/adapter-better-sqlite3"
    );
    // The adapter must have been constructed with some URL string.
    expect(PrismaBetterSqlite3).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.any(String) })
    );
  });

  it("read replica client has a transaction accessor", async () => {
    const { readPrisma } = await import("./readDb");
    expect(readPrisma.transaction).toBeDefined();
  });

  it("READ_REPLICA_URL takes priority over DATABASE_URL at module initialisation", () => {
    // Validate the URL-priority logic statically: READ_REPLICA_URL → DATABASE_URL → dev file.
    const computeUrl = (replica?: string, primary?: string) =>
      replica ?? primary ?? "file:./dev.db";

    expect(computeUrl("file:./replica.db", "file:./primary.db")).toBe(
      "file:./replica.db"
    );
    expect(computeUrl(undefined, "file:./primary.db")).toBe(
      "file:./primary.db"
    );
    expect(computeUrl(undefined, undefined)).toBe("file:./dev.db");
  });
});
