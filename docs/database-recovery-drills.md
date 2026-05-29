# Database Recovery Drills

The Database Recovery Drills feature provides automated verification of the platform's SQLite database backup and restoration procedures. This ensures high availability, reliability, and readiness in disaster recovery scenarios.

## Architecture

The recovery drill architecture consists of the following components:

1. **`DatabaseRecoveryDrillsService`** (`src/services/databaseRecoveryDrills.ts`):
   - Copies the active database file to a backup path.
   - Restores the backup to a separate temporary path.
   - Instantiates a dynamic, temporary Prisma connection to the restored database.
   - Executes integrity verification (`PRAGMA integrity_check`).
   - Counts and validates primary records (`Tenant`, `Transaction`, `AdminUser`) to verify structure.
   - Automatically cleans up all temporary file handles.
   
2. **`DatabaseRecoveryDrillsWorker`** (`src/workers/databaseRecoveryDrillsWorker.ts`):
   - A background worker extending `BaseWorker` that runs recovery drills once every 24 hours.

3. **HTTP Control Endpoint** (`POST /admin/db/recovery-drill`):
   - Exposes a trigger endpoint for administrators to execute drills on-demand and receive detailed diagnostic JSON reports.

## Configuration

No extra configuration is needed. The service automatically extracts the file location from the standard `DATABASE_URL` environment variable.
