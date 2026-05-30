# Database Migration Benchmarking

The database migration benchmarking tool is designed to test slow-running Prisma migrations against large datasets before they are deployed to production. 

Because production environments typically have significantly more data than local development databases, migrations that execute quickly locally might lock database tables or cause downtime in production. The migration benchmark tool simulates a production-like volume of data to measure exactly how long a new migration will take.

## How it works

1. **Isolation**: The tool creates a temporary, isolated SQLite database (`bench_migration.db`).
2. **Schema Application**: It temporarily hides your *latest* migration and applies all prior migrations to set up the base schema.
3. **Seeding**: It bypasses Prisma Client and uses raw SQL via `better-sqlite3` to insert a massive synthetic dataset. This avoids any schema mismatch errors between the generated Prisma types and the intermediate database state.
4. **Execution & Timing**: The tool restores the latest migration and executes `prisma migrate deploy`, accurately timing the execution of your new migration against the massive dataset.
5. **Reporting**: A `migration_benchmark_report.md` report is generated containing the time taken and memory overhead.

## Usage

To benchmark your most recent migration, run:

```bash
pnpm run benchmark:migration
```

### Configuration Options

You can adjust the size of the dataset by modifying the defaults in `src/benchmarks/migration.ts`. Currently, the default load is:
- **Tenants**: 10,000
- **Transactions**: 100,000

If your migration affects a specific table (e.g. `WebhookDelivery` or `CrossChainSettlement`), you should update `src/benchmarks/migration.ts` to seed those tables heavily before running the benchmark.

## Best Practices

- Run the benchmark locally *after* creating a new migration using `prisma migrate dev --create-only` and *before* committing it.
- If the benchmark reveals a migration that takes longer than expected (e.g., several minutes), consider rewriting the migration to operate in batches or avoiding table locks.
- Review the generated `migration_benchmark_report.md` for memory usage anomalies to ensure your migration script is efficient.
