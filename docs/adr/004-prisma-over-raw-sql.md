# ADR 004: Prisma ORM over Raw SQL for the Node API

## Status

Accepted

## Context

The Node.js API server (`server/`) requires a database layer for tenant management, API key storage, subscription tier data, audit logs, SAR reports, and multi-chain chain registry. The team evaluated three approaches:

| Approach | Examples |
|----------|---------|
| Raw SQL via a query builder | `pg`, `knex` |
| Lightweight ORM | `TypeORM`, `Sequelize` |
| Schema-first ORM with a type-safe client | `Prisma` |

Key requirements:

1. **Type safety end-to-end** — the TypeScript application should receive typed results without manual casting.
2. **Schema as the source of truth** — schema changes must generate auditable migration files rather than being applied ad hoc.
3. **Developer velocity** — contributors should be able to query the database without writing raw SQL for common operations.
4. **Multi-database support** — local development uses SQLite for zero-setup convenience; production uses PostgreSQL. The ORM must support both without code changes.
5. **Regional sharding** — Fluid supports US and EU data-residency regions, each backed by a separate database. The data layer must support multiple connections to different database URLs at runtime.

Raw SQL (`pg` + `knex`) was eliminated because it provides no compile-time type checking and requires manual maintenance of TypeScript interfaces that mirror the schema. `TypeORM` and `Sequelize` were ruled out because their decorator-based models diverge from the schema file, making migration tracking error-prone.

## Decision

We will use Prisma as the ORM for the Node.js server. The Prisma schema (`server/prisma/schema.prisma`) is the single source of truth for the database structure. Migration files are generated via `prisma migrate dev` and committed to the repository.

For the regional sharding requirement, a `PrismaClient` instance is constructed per region at startup in `server/src/services/regionRouter.ts`, each pointing to its own `DATABASE_URL`. Request handlers receive the correct regional client via `res.locals.db`.

The Rust signing engine uses `sqlx` directly (not Prisma) because Prisma has no Rust client; `sqlx` provides equivalent compile-time query verification for the Rust codebase.

## Consequences

- **Pros**:
  - The generated Prisma client is fully typed; TypeScript catches query result mismatches at compile time.
  - `prisma migrate` produces SQL migration files that are reviewable in pull requests and replayable in CI.
  - Switching from SQLite (dev) to PostgreSQL (prod) requires only a `DATABASE_URL` change; no application code changes.
  - Prisma Studio provides a zero-config database browser for local debugging.
- **Cons**:
  - Prisma adds a code-generation step (`prisma generate`) to the build; contributors must run it after schema changes.
  - The Prisma query engine binary adds ~20 MB to the container image.
  - Complex analytical queries (e.g., spend forecasting in `adminAnalytics.ts`) occasionally require dropping to raw SQL via `prisma.$queryRaw`, bypassing type safety for those queries.
  - Prisma does not natively support the same schema file targeting multiple database engines simultaneously; the `provider` in `schema.prisma` must be set to `postgresql` for production builds.
- **Neutral**:
  - The Rust engine's `sqlx` and the Node.js Prisma client operate on the same PostgreSQL schema; schema changes must be coordinated across both codebases.
