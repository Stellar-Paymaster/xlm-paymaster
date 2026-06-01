import { describe, expect, it, vi } from "vitest";
import {
  addMonths,
  AuditLogPartitionManager,
  partitionEnd,
  partitionName,
  partitionStart,
  subtractMonths,
} from "./auditLogPartitionManager";

// ---------------------------------------------------------------------------
// Pure helper tests
// ---------------------------------------------------------------------------

describe("partitionName", () => {
  it("pads month with leading zero", () => {
    expect(partitionName(2026, 1)).toBe("audit_log_y2026_m01");
    expect(partitionName(2026, 12)).toBe("audit_log_y2026_m12");
  });
});

describe("partitionStart", () => {
  it("returns first day of the month at midnight", () => {
    expect(partitionStart(2026, 3)).toBe("2026-03-01 00:00:00");
  });
});

describe("partitionEnd", () => {
  it("returns first day of the next month", () => {
    expect(partitionEnd(2026, 3)).toBe("2026-04-01 00:00:00");
  });

  it("wraps year correctly for December", () => {
    expect(partitionEnd(2026, 12)).toBe("2027-01-01 00:00:00");
  });
});

describe("addMonths / subtractMonths", () => {
  it("adds months within the same year", () => {
    expect(addMonths(2026, 1, 3)).toEqual({ year: 2026, month: 4 });
  });

  it("wraps to next year", () => {
    expect(addMonths(2026, 11, 3)).toEqual({ year: 2027, month: 2 });
  });

  it("subtracts months within the same year", () => {
    expect(subtractMonths(2026, 6, 3)).toEqual({ year: 2026, month: 3 });
  });

  it("wraps to previous year", () => {
    expect(subtractMonths(2026, 2, 3)).toEqual({ year: 2025, month: 11 });
  });
});

// ---------------------------------------------------------------------------
// AuditLogPartitionManager tests
// ---------------------------------------------------------------------------

describe("AuditLogPartitionManager", () => {
  describe("ensurePartitions", () => {
    it("creates partitions for the configured window", async () => {
      const manager = new AuditLogPartitionManager({
        retentionMonths: 2,
        futureMonths: 1,
      });

      const executed: string[] = [];
      const executor = vi.fn(async (sql: string) => {
        executed.push(sql);
      });

      const created = await manager.ensurePartitions(executor);

      // 2 past + current + 1 future = 4 partitions
      expect(created.length).toBe(4);
      expect(executor).toHaveBeenCalledTimes(4);
      // Each SQL should be a CREATE TABLE IF NOT EXISTS
      for (const sql of executed) {
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS");
        expect(sql).toContain("PARTITION OF");
      }
    });

    it("ignores 'already exists' errors", async () => {
      const manager = new AuditLogPartitionManager({
        retentionMonths: 0,
        futureMonths: 0,
      });

      const executor = vi.fn(async () => {
        throw new Error("relation already exists");
      });

      // Should not throw
      await expect(manager.ensurePartitions(executor)).resolves.toBeDefined();
    });

    it("re-throws non-existence errors", async () => {
      const manager = new AuditLogPartitionManager({
        retentionMonths: 0,
        futureMonths: 0,
      });

      const executor = vi.fn(async () => {
        throw new Error("permission denied");
      });

      await expect(manager.ensurePartitions(executor)).rejects.toThrow(
        "permission denied",
      );
    });
  });

  describe("listPartitions", () => {
    it("parses partition names into PartitionInfo objects", async () => {
      const manager = new AuditLogPartitionManager();
      const query = vi.fn(async () => [
        { tablename: "audit_log_y2026_m01" },
        { tablename: "audit_log_y2026_m02" },
      ]);

      const partitions = await manager.listPartitions(query);

      expect(partitions).toHaveLength(2);
      expect(partitions[0].name).toBe("audit_log_y2026_m01");
      expect(partitions[0].rangeStart).toBe("2026-01-01 00:00:00");
      expect(partitions[0].rangeEnd).toBe("2026-02-01 00:00:00");
    });

    it("handles unrecognised table names gracefully", async () => {
      const manager = new AuditLogPartitionManager();
      const query = vi.fn(async () => [{ tablename: "audit_log_default" }]);

      const partitions = await manager.listPartitions(query);
      expect(partitions[0].rangeStart).toBe("");
    });
  });

  describe("pruneOldPartitions", () => {
    it("drops partitions older than retentionMonths", async () => {
      const manager = new AuditLogPartitionManager({ retentionMonths: 1 });

      const now = new Date();
      const oldYear = now.getUTCFullYear() - 1;
      const oldMonth = now.getUTCMonth() + 1; // same month last year

      const oldName = partitionName(oldYear, oldMonth);
      const currentName = partitionName(
        now.getUTCFullYear(),
        now.getUTCMonth() + 1,
      );

      const query = vi.fn(async () => [
        { tablename: oldName },
        { tablename: currentName },
      ]);

      const dropped: string[] = [];
      const executor = vi.fn(async (sql: string) => {
        dropped.push(sql);
      });

      const result = await manager.pruneOldPartitions(executor, query);

      expect(result).toContain(oldName);
      expect(result).not.toContain(currentName);
      expect(dropped.some((s) => s.includes(oldName))).toBe(true);
    });

    it("does not drop partitions within retention window", async () => {
      const manager = new AuditLogPartitionManager({ retentionMonths: 24 });

      const now = new Date();
      const name = partitionName(
        now.getUTCFullYear(),
        now.getUTCMonth() + 1,
      );

      const query = vi.fn(async () => [{ tablename: name }]);
      const executor = vi.fn(async () => {});

      const result = await manager.pruneOldPartitions(executor, query);
      expect(result).toHaveLength(0);
      expect(executor).not.toHaveBeenCalled();
    });
  });
});
