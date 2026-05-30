# SQL Injection Audit — Prisma Raw Queries (`server/`)

**Scope:** All dynamic/raw database queries in the legacy Node server (`server/src`).
**Goal:** Confirm database access is fully parameterized and that no raw query is
exposed to SQL injection via dynamic string concatenation.
**Date:** 2026-05-29

---

## 1. Method

The codebase uses Prisma with the `better-sqlite3` adapter (`src/utils/db.ts`).
Three families of query API are in use:

| API | Value binding | Identifier binding |
| --- | --- | --- |
| Prisma model methods (`prisma.tenant.findMany`, etc.) | safe (driver-bound) | n/a |
| `$queryRaw` / `$executeRaw` (tagged template) | safe — `${x}` becomes a bound parameter | not interpolable |
| `$queryRawUnsafe` / `$executeRawUnsafe` (string + varargs) | safe **only if** values are passed as `?` placeholder args | interpolated as raw string |

The audit enumerated every raw call (`grep` for `queryRaw`/`executeRaw` across
`src/`, excluding test files) and classified each by how **values** and
**identifiers** reach the SQL string.

> **Key distinction:** Prisma can bind *values* but **cannot** bind *identifiers*
> (table/column names). Identifiers must be interpolated into the string, and that
> interpolation is the only residual injection surface. The remediation below
> centralizes and hardens identifier interpolation.

---

## 2. Inventory & findings

| # | Location | Statement | Values | Identifiers | Verdict |
| - | -------- | --------- | ------ | ----------- | ------- |
| 1 | `services/statusMonitorService.ts:174` | `SELECT 1 as health_check` | none | none (static) | ✅ Safe |
| 2 | `services/tenantUsageTracker.ts:98` | hourly `GROUP BY` aggregate | `${tenantId}`, `${date}` via **tagged template** → bound params | none | ✅ Safe |
| 3 | `services/auditLogger.ts:98–130` | `CREATE TABLE` / `ALTER` / `DROP TRIGGER` (DDL) | none | none (static literals) | ✅ Safe (DDL, no input) |
| 4 | `services/discordMilestones.ts:207` | `CREATE TABLE IF NOT EXISTS` | none | none (static) | ✅ Safe (DDL, no input) |
| 5 | `services/discordMilestones.ts:226` | `SELECT … WHERE "threshold" = ?` | `?` placeholder arg | none | ✅ Safe |
| 6 | `services/discordMilestones.ts:269` | `INSERT … ON CONFLICT` | `?` placeholder args | none | ✅ Safe |
| 7 | `services/tenantErasure.ts:208` | `PRAGMA table_info(<table>)` | none | `AUDIT_LOG_TABLE` constant | ⚠️ Hardened |
| 8 | `services/tenantErasure.ts:229` | `SELECT <cols> FROM <table>` | none | column allowlist + constant | ⚠️ Hardened |
| 9 | `services/tenantErasure.ts:255/264` | `UPDATE <table> SET <col> = ? … WHERE "id" = ?` | `?` placeholder args | column allowlist + constant | ⚠️ Hardened |
| 10 | `services/tenantErasure.ts:416` | `SELECT name FROM sqlite_master …` | none | none (static) | ✅ Safe |
| 11 | `services/tenantErasure.ts:436` | `DELETE FROM <table> WHERE "tenantId" = ?` | `?` placeholder arg | table allowlist | ⚠️ Hardened |
| 12 | `services/tenantErasure.ts:472` | `UPDATE "Transaction" SET "tenantId" = NULL WHERE "tenantId" = ?` | `?` placeholder arg | table allowlist | ⚠️ Hardened |

### Result

- **No exploitable SQL injection was found.** Every query that handles a *value*
  already binds it as a parameter — either through `?` placeholder arguments to
  the `Unsafe` APIs or through the `$queryRaw` tagged template. No user-supplied
  value is concatenated into any SQL string.
- The only raw-string interpolation in the codebase is of **identifiers**
  (table/column names) in `tenantErasure.ts`. Those identifiers were already
  sourced exclusively from **hardcoded constants** and a **fixed allowlist**
  (`["target","payload","metadata","aiSummary"]`) plus call sites that pass
  literal table names — none of them user-controlled.
- The risk addressed here is therefore **latent, not live**: the pattern of
  interpolating an identifier into a `$...Unsafe` call is fragile, because a
  future caller could pass an untrusted name and silently introduce a vuln.

---

## 3. Remediation

Added `src/db/sqlIdentifiers.ts`, a single hardened choke point for identifier
interpolation:

- `quoteIdentifier(name, allowlist?)` — rejects any name that is not a bare SQL
  identifier (`^[A-Za-z_][A-Za-z0-9_]*$`, which excludes quotes, whitespace,
  `;`, `--`, parentheses, etc.) and, when an allowlist is supplied, requires the
  name to be a member of it. Returns the name double-quoted.
- `quoteIdentifierList(names, allowlist?)` — same guarantees for a column list.
- `ERASURE_TABLE_ALLOWLIST` / `AUDIT_LOG_COLUMN_ALLOWLIST` — the finite, explicit
  sets of identifiers the erasure paths are permitted to touch.

`services/tenantErasure.ts` was refactored so **every** interpolated table and
column name flows through these helpers (findings #7–#9, #11, #12). The emitted
SQL is byte-for-byte identical to before, so the value-binding behaviour is
unchanged — the difference is that an out-of-allowlist or malformed identifier
now throws instead of reaching the database.

DDL statements (#3, #4) and static queries (#1, #10) were left as-is: they
contain no interpolation and no input. `$queryRaw`-tagged-template and
`?`-placeholder queries (#2, #5, #6) were left as-is: they are already
parameterized.

### Why some queries remain raw

These cannot be expressed with Prisma client model methods and must stay raw —
they are safe because they take no input:

- `PRAGMA table_info(...)` and `SELECT … FROM sqlite_master` — SQLite
  introspection; no Prisma client equivalent.
- `CREATE TABLE` / `ALTER TABLE` / `DROP TRIGGER` — DDL; not modelled by the
  Prisma client.
- `INSERT … ON CONFLICT` and the `DiscordMilestone` table — that table is created
  at runtime via raw DDL and is **not** in `schema.prisma`, so no generated model
  exists for it. Its writes are already `?`-parameterized.

---

## 4. Verification

- `src/db/sqlIdentifiers.test.ts` — 14 cases covering valid names, allowlist
  enforcement, and rejection of injection-shaped inputs
  (`tenantId"; DROP TABLE Tenant; --`, etc.).
- `src/services/tenantErasure.test.ts` — unchanged; still asserts the exact SQL
  strings, proving the refactor is behaviour-preserving.
- `src/services/auditLogger.test.ts` — unchanged; still passes.

```
$ npx vitest run src/db/sqlIdentifiers.test.ts src/services/tenantErasure.test.ts src/services/auditLogger.test.ts
 Test Files  3 passed (3)
      Tests  24 passed (24)
```

> Pre-existing, unrelated failures observed in the wider suite
> (`statusMonitorService.test.ts` Horizon-timeout mocks, `adminAuditLog.test.ts`
> 401 auth case) are **not** caused by and **not** in scope of this change.
