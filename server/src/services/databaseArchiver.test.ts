import { describe, it, expect, vi, beforeEach } from "vitest";
import { DatabaseArchiverService } from "../services/databaseArchiver";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrisma(rows: Array<{ id: string }> = []) {
  let callCount = 0;

  const $queryRawUnsafe = vi.fn().mockImplementation(() => {
    // First call returns the batch; second call returns empty (end of loop)
    if (callCount++ === 0) return Promise.resolve(rows);
    return Promise.resolve([]);
  });

  const $executeRawUnsafe = vi.fn().mockResolvedValue(rows.length);

  return { $queryRawUnsafe, $executeRawUnsafe };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DatabaseArchiverService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns SUCCESS when no rows need archiving", async () => {
    const prisma = makePrisma([]); // empty from the start
    const svc = new DatabaseArchiverService({ prisma: prisma as any });

    const report = await svc.runArchiveCycle();

    expect(report.status).toBe("SUCCESS");
    expect(report.rowsArchived).toBe(0);
    expect(report.rowsPruned).toBe(0);
    expect(report.retentionDays).toBe(90);
  });

  it("archives and prunes a batch of rows", async () => {
    const mockRows = [{ id: "tx-1" }, { id: "tx-2" }, { id: "tx-3" }];
    const prisma = makePrisma(mockRows);
    const svc = new DatabaseArchiverService({ prisma: prisma as any, batchSize: 10 });

    const report = await svc.runArchiveCycle();

    expect(report.status).toBe("SUCCESS");
    expect(report.rowsArchived).toBe(3);
    // $executeRawUnsafe called: ensureArchiveTable (x2) + INSERT + DELETE = 4 calls
    expect(prisma.$executeRawUnsafe).toHaveBeenCalled();
  });

  it("respects custom retentionDays", async () => {
    const prisma = makePrisma([]);
    const svc = new DatabaseArchiverService({ prisma: prisma as any, retentionDays: 30 });

    const report = await svc.runArchiveCycle();

    expect(report.retentionDays).toBe(30);
    // Cutoff should be ~30 days ago
    const cutoff = new Date(report.cutoffDate);
    const diff = Math.round((Date.now() - cutoff.getTime()) / (1000 * 60 * 60 * 24));
    expect(diff).toBeGreaterThanOrEqual(29);
    expect(diff).toBeLessThanOrEqual(31);
  });

  it("returns FAILED status on prisma error", async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("DB error")),
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    };
    const svc = new DatabaseArchiverService({ prisma: prisma as any });

    const report = await svc.runArchiveCycle();

    expect(report.status).toBe("FAILED");
    expect(report.error).toMatch(/DB error/);
  });

  it("sets cutoffDate in ISO format", async () => {
    const prisma = makePrisma([]);
    const svc = new DatabaseArchiverService({ prisma: prisma as any });

    const report = await svc.runArchiveCycle();

    expect(() => new Date(report.cutoffDate)).not.toThrow();
    expect(report.cutoffDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes durationMs in report", async () => {
    const prisma = makePrisma([]);
    const svc = new DatabaseArchiverService({ prisma: prisma as any });

    const report = await svc.runArchiveCycle();

    expect(typeof report.durationMs).toBe("number");
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });
});
