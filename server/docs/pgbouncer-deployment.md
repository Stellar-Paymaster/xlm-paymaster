# PgBouncer Connection Pooling — Deployment Guide

## Why PgBouncer?

Postgres has a hard ceiling on simultaneous server connections (`max_connections`, default 100). In serverless or horizontally-scaled deployments each function invocation or container replica opens its own connection pool. With three node-api replicas and Prisma's default pool of 10, that is 30 connections before any load. PgBouncer multiplexes all of these into a small, fixed set of long-lived Postgres connections.

```
App replicas (1–N)          PgBouncer             Postgres
────────────────────        ─────────────         ──────────────────────
replica-1 (10 conns)  ─┐                         20 server connections
replica-2 (10 conns)  ─┤──► pool (1000 client ──► (always open, shared
replica-3 (10 conns)  ─┘     connections max)       across all clients)
...serverless funcs   ─┘
```

## Local development (docker-compose)

PgBouncer is already wired into `docker-compose.yml`. Just run:

```bash
docker compose up
```

PgBouncer listens on **port 6432**. The `node-api` container automatically
connects through it.

Check the pool stats at any time:

```bash
psql postgresql://pgbouncer:pgbouncer_admin_pass@localhost:6432/pgbouncer \
  -c "SHOW POOLS;"
```

## Environment variables

Set `DATABASE_URL` to point at PgBouncer instead of Postgres:

```
# Postgres direct (do NOT use when running through PgBouncer):
DATABASE_URL=postgresql://fluid:fluid_pass@localhost:5432/fluid_db

# PgBouncer pooled (transaction mode, Prisma-compatible):
DATABASE_URL=postgresql://fluid:fluid_pass@localhost:6432/fluid_db?pgbouncer=true
```

> **`?pgbouncer=true`** is mandatory. It tells Prisma to skip prepared statements,
> which are connection-scoped and break under transaction-mode pooling.

## Production — standalone PgBouncer

### 1. Install

```bash
# Ubuntu / Debian
sudo apt-get install pgbouncer

# or run as a sidecar container
docker run -d \
  -e DB_HOST=your-rds-endpoint \
  -e DB_USER=fluid \
  -e DB_PASSWORD=... \
  -e DB_NAME=fluid_db \
  -e POOL_MODE=transaction \
  -e MAX_CLIENT_CONN=1000 \
  -e DEFAULT_POOL_SIZE=20 \
  -p 6432:6432 \
  edoburu/pgbouncer:latest
```

### 2. Point the Node API at PgBouncer

```
DATABASE_URL=postgresql://fluid:pass@pgbouncer-host:6432/fluid_db?pgbouncer=true
```

### 3. Pool tuning

| Parameter | Recommended | Notes |
|-----------|-------------|-------|
| `POOL_MODE` | `transaction` | Required for Prisma |
| `MAX_CLIENT_CONN` | 1000–5000 | Total simultaneous app connections |
| `DEFAULT_POOL_SIZE` | `max_connections × 0.8 / shard_count` | Leave room for admin |
| `MIN_POOL_SIZE` | 2 | Keep warm connections open |
| `SERVER_IDLE_TIMEOUT` | 600 | Recycle idle server connections |

## Vercel / serverless

Serverless functions are stateless — each invocation may open a brand-new
connection. Without a pooler, a Vercel deployment with 100 concurrent requests
can easily exhaust Postgres's 100-connection limit.

### Option A: Self-hosted PgBouncer sidecar (EC2, ECS, Fly.io)

Run PgBouncer as a long-lived sidecar that all serverless invocations share.
Point every function's `DATABASE_URL` at the sidecar.

### Option B: Prisma Accelerate (managed)

[Prisma Accelerate](https://www.prisma.io/data-platform/accelerate) is a hosted
connection pooler built on PgBouncer. Swap your `DATABASE_URL` for the Accelerate
connection string — no infrastructure to manage.

### Option C: Supabase / Neon built-in poolers

If using Supabase or Neon, both provide a built-in PgBouncer endpoint on port 6543
(Supabase) or via the Neon serverless driver. Use that URL directly.

## Prisma migration compatibility

PgBouncer transaction mode is **incompatible with `prisma migrate`** because
migrations require session-level constructs (advisory locks, `SET` commands).

Always run migrations by connecting **directly** to Postgres, not through PgBouncer:

```bash
# Use the direct Postgres URL, NOT the PgBouncer URL
DATABASE_URL="postgresql://fluid:pass@postgres-host:5432/fluid_db" \
  npx prisma migrate deploy
```

## Monitoring

```sql
-- Connect to PgBouncer admin database
psql postgresql://pgbouncer:admin_pass@localhost:6432/pgbouncer

-- Pool status
SHOW POOLS;

-- Per-database statistics
SHOW STATS;

-- Active client connections
SHOW CLIENTS;

-- Active server connections
SHOW SERVERS;
```
