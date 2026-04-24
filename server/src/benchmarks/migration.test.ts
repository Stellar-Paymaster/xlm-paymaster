import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MigrationBenchmarker } from "./migration";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("MigrationBenchmarker", () => {
  let tempDir: string;
  let migrationsDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-bench-test-"));
    migrationsDir = path.join(tempDir, "migrations");
    fs.mkdirSync(migrationsDir);
    
    // Create fake migrations
    fs.mkdirSync(path.join(migrationsDir, "20230101000000_init"));
    fs.mkdirSync(path.join(migrationsDir, "20230102000000_add_table"));

    dbPath = path.join(tempDir, "bench_migration.db");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("should fail if no migrations exist", async () => {
    fs.rmSync(migrationsDir, { recursive: true, force: true });
    
    const benchmarker = new MigrationBenchmarker({
      dbPath,
      migrationsDir,
    });

    await expect(benchmarker.runBenchmark()).rejects.toThrow("No migrations found");
  });

  it("should temporarily hide the latest migration and run the benchmark", async () => {
    const benchmarker = new MigrationBenchmarker({
      dbPath,
      migrationsDir,
      tenantsCount: 10,
      transactionsCount: 100,
    });

    // Mock heavy operations
    const setupSpy = vi.spyOn(benchmarker, "setupDatabase").mockResolvedValue();
    const seedSpy = vi.spyOn(benchmarker, "seedDatabase").mockResolvedValue();
    const runPrismaMigrateDeploySpy = vi.spyOn(benchmarker as any, "runPrismaMigrateDeploy").mockImplementation(() => {});

    const result = await benchmarker.runBenchmark();

    // Verify workflow
    expect(setupSpy).toHaveBeenCalledWith("20230102000000_add_table");
    expect(seedSpy).toHaveBeenCalled();
    expect(runPrismaMigrateDeploySpy).toHaveBeenCalledTimes(1);

    // Verify result
    expect(result.migrationName).toBe("20230102000000_add_table");
    expect(result.tenantsCount).toBe(10);
    expect(result.transactionsCount).toBe(100);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    // Verify restoration
    const finalMigrations = fs.readdirSync(migrationsDir);
    expect(finalMigrations).toContain("20230101000000_init");
    expect(finalMigrations).toContain("20230102000000_add_table");
  });

  it("should correctly cleanup even if a step fails", async () => {
    const benchmarker = new MigrationBenchmarker({
      dbPath,
      migrationsDir,
    });

    vi.spyOn(benchmarker, "setupDatabase").mockResolvedValue();
    vi.spyOn(benchmarker, "seedDatabase").mockRejectedValue(new Error("Seed failed"));
    const cleanupSpy = vi.spyOn(benchmarker, "cleanup");

    await expect(benchmarker.runBenchmark()).rejects.toThrow("Seed failed");

    expect(cleanupSpy).toHaveBeenCalled();
    
    // Verify latest migration is restored
    const finalMigrations = fs.readdirSync(migrationsDir);
    expect(finalMigrations).toContain("20230102000000_add_table");
  });
});
