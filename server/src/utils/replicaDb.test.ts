import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Verifies the read/write splitting behaviour of db.ts:
 *
 *  - When DATABASE_REPLICA_URL is absent, replicaDb points at the same
 *    connection URL as the primary prisma client (safe fallback).
 *  - When DATABASE_REPLICA_URL is set, replicaDb uses that URL instead.
 *  - The primary prisma client always uses DATABASE_URL.
 *
 * We mock the adapter constructor to capture which URL each client receives
 * without needing a real SQLite file.
 */

const capturedUrls: { primary: string | null; replica: string | null } = {
  primary: null,
  replica: null,
};

vi.mock("@prisma/adapter-better-sqlite3", () => {
  let callCount = 0;
  return {
    PrismaBetterSqlite3: vi.fn((opts: { url: string }) => {
      if (callCount === 0) {
        capturedUrls.primary = opts.url;
      } else {
        capturedUrls.replica = opts.url;
      }
      callCount++;
      return {};
    }),
  };
});

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => ({
    $extends: vi.fn(function (this: object) {
      return this;
    }),
  })),
}));

vi.mock("./prismaEncryption", () => ({
  encryptionExtension: {},
}));

describe("db read/write splitting", () => {
  const originalPrimary = process.env.DATABASE_URL;
  const originalReplica = process.env.DATABASE_REPLICA_URL;

  beforeEach(() => {
    // Reset module registry so db.ts is re-evaluated per test.
    vi.resetModules();
    capturedUrls.primary = null;
    capturedUrls.replica = null;
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalPrimary;
    process.env.DATABASE_REPLICA_URL = originalReplica;
  });

  it("uses DATABASE_URL for both clients when no replica is configured", async () => {
    process.env.DATABASE_URL = "file:./test-primary.db";
    delete process.env.DATABASE_REPLICA_URL;

    await import("./db");

    expect(capturedUrls.primary).toBe("file:./test-primary.db");
    expect(capturedUrls.replica).toBe("file:./test-primary.db");
  });

  it("uses DATABASE_REPLICA_URL for the replica client when configured", async () => {
    process.env.DATABASE_URL = "postgresql://primary:5432/fluid";
    process.env.DATABASE_REPLICA_URL = "postgresql://replica:5432/fluid";

    await import("./db");

    expect(capturedUrls.primary).toBe("postgresql://primary:5432/fluid");
    expect(capturedUrls.replica).toBe("postgresql://replica:5432/fluid");
  });

  it("exports both prisma (primary) and replicaDb", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    delete process.env.DATABASE_REPLICA_URL;

    const mod = await import("./db");

    expect(mod.prisma).toBeDefined();
    expect(mod.replicaDb).toBeDefined();
    expect(mod.default).toBe(mod.prisma);
  });
});
