import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "database_recovery_drills" });

export interface DrillReport {
  drillTimestamp: string;
  sourceDbPath: string;
  backupPath: string;
  restoredPath: string;
  backupSize: number;
  durationMs: number;
  integrityCheck: string;
  recordsVerified: {
    tenantsCount: number;
    transactionsCount: number;
    adminUsersCount: number;
  };
  status: "SUCCESS" | "FAILED";
  error?: string;
}

export class DatabaseRecoveryDrillsService {
  public async runDrill(): Promise<DrillReport> {
    const startTime = Date.now();
    const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
    const dbPath = dbUrl.startsWith("file:") ? dbUrl.substring(5) : dbUrl;
    const resolvedDbPath = path.resolve(process.cwd(), dbPath);

    const timestamp = Date.now();
    const backupPath = path.resolve(process.cwd(), `drill_backup_${timestamp}.db`);
    const restoredPath = path.resolve(process.cwd(), `drill_restored_${timestamp}.db`);

    let status: "SUCCESS" | "FAILED" = "FAILED";
    let errorMsg: string | undefined;
    let backupSize = 0;
    let integrityCheck = "unknown";
    let recordsVerified = {
      tenantsCount: 0,
      transactionsCount: 0,
      adminUsersCount: 0,
    };

    try {
      if (!fs.existsSync(resolvedDbPath)) {
        throw new Error(`Source database file does not exist at: ${resolvedDbPath}`);
      }

      // Step 1: Backup
      logger.info({ source: resolvedDbPath, backup: backupPath }, "Creating database backup...");
      fs.copyFileSync(resolvedDbPath, backupPath);
      const backupStats = fs.statSync(backupPath);
      backupSize = backupStats.size;

      // Step 2: Restore
      logger.info({ backup: backupPath, restored: restoredPath }, "Restoring database backup...");
      fs.copyFileSync(backupPath, restoredPath);

      // Step 3: Verify Integrity & Queries
      logger.info({ restored: restoredPath }, "Verifying restored database integrity...");
      const adapter = new PrismaBetterSqlite3({ url: `file:${restoredPath}` });
      const tempPrisma = new PrismaClient({
        adapter,
        log: [],
      }) as any;

      try {
        const integrity: any = await tempPrisma.$queryRawUnsafe("PRAGMA integrity_check;");
        integrityCheck = Array.isArray(integrity) && integrity[0]
          ? (Object.values(integrity[0])[0] as string)
          : String(integrity);

        if (integrityCheck.toLowerCase() !== "ok") {
          throw new Error(`Integrity check failed: ${integrityCheck}`);
        }

        // Verify count of records
        recordsVerified.tenantsCount = await tempPrisma.tenant.count();
        recordsVerified.transactionsCount = await tempPrisma.transaction.count();
        recordsVerified.adminUsersCount = await tempPrisma.adminUser.count();

        status = "SUCCESS";
      } finally {
        await tempPrisma.$disconnect();
      }
    } catch (err: any) {
      errorMsg = err.message || String(err);
      status = "FAILED";
      logger.error({ error: errorMsg }, "Database recovery drill failed");
    } finally {
      // Step 4: Cleanup
      logger.info("Cleaning up drill database files...");
      if (fs.existsSync(backupPath)) {
        try {
          fs.unlinkSync(backupPath);
        } catch {}
      }
      if (fs.existsSync(restoredPath)) {
        try {
          fs.unlinkSync(restoredPath);
        } catch {}
      }
    }

    const durationMs = Date.now() - startTime;
    return {
      drillTimestamp: new Date().toISOString(),
      sourceDbPath: resolvedDbPath,
      backupPath,
      restoredPath,
      backupSize,
      durationMs,
      integrityCheck,
      recordsVerified,
      status,
      ...(errorMsg ? { error: errorMsg } : {}),
    };
  }
}
