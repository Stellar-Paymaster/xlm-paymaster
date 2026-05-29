import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseRecoveryDrillsService } from "./databaseRecoveryDrills";
import * as fs from "fs";
import * as path from "path";

describe("DatabaseRecoveryDrillsService", () => {
  let service: DatabaseRecoveryDrillsService;
  const testDbPath = path.resolve(process.cwd(), "test_drill.db");
  let originalDbUrl: string | undefined;

  beforeEach(() => {
    service = new DatabaseRecoveryDrillsService();
    originalDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `file:${testDbPath}`;
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalDbUrl;
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch {}
    }
  });

  it("should fail when database file does not exist", async () => {
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch {}
    }
    const report = await service.runDrill();
    expect(report.status).toBe("FAILED");
    expect(report.error).toContain("does not exist");
  });

  it("should execute drill flow and handle cleanup correctly", async () => {
    // Write a dummy file to simulate the database
    fs.writeFileSync(testDbPath, "mock database content");

    const report = await service.runDrill();
    expect(report).toBeDefined();
    expect(report.sourceDbPath).toBe(testDbPath);
    // Assert cleanup of temporary files worked
    expect(fs.existsSync(report.backupPath)).toBe(false);
    expect(fs.existsSync(report.restoredPath)).toBe(false);
  });
});
