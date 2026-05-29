/**
 * SQL identifier safety helpers.
 *
 * Prisma binds *values* safely through parameter placeholders (`?` for
 * `$queryRawUnsafe`/`$executeRawUnsafe`, and `${}` interpolation inside the
 * `$queryRaw` tagged template). It does NOT, however, parameterize *identifiers*
 * — table and column names cannot be bound and must be interpolated into the SQL
 * string directly.
 *
 * That interpolation is the one place a raw query can still become injectable, so
 * every identifier that is concatenated into a raw statement must pass through
 * {@link quoteIdentifier}. It enforces two layers of defense:
 *
 *   1. A strict shape check — the identifier must look like a bare SQL identifier
 *      (`^[A-Za-z_][A-Za-z0-9_]*$`). This rejects quotes, whitespace, semicolons,
 *      comment markers, and every other character an attacker would need to break
 *      out of the quoted identifier.
 *   2. An optional allowlist — when the caller knows the finite set of legal
 *      identifiers (which is true for every current call site), the identifier
 *      must be a member of that set. This is the strongest guarantee: even a
 *      perfectly-shaped-but-unexpected name is refused.
 *
 * The helper always returns the identifier wrapped in double quotes, matching the
 * quoting style already used across the raw queries in this codebase.
 */

/** A bare, unquoted SQL identifier: starts with a letter/underscore, then word chars. */
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Tables that the GDPR tenant-erasure purge is permitted to mutate by raw query.
 * Kept in sync with the call sites in {@link file://./services/tenantErasure.ts}.
 */
export const ERASURE_TABLE_ALLOWLIST: ReadonlySet<string> = new Set([
  "WebhookDlq",
  "WebhookDelivery",
  "QuotaTopUp",
  "Payment",
  "SponsoredTransaction",
  "TenantUsageStats",
  "TierAdjustment",
  "ApiKey",
  "Transaction",
]);

/** Columns on the AuditLog table that the erasure scrubber may read/write by raw query. */
export const AUDIT_LOG_COLUMN_ALLOWLIST: ReadonlySet<string> = new Set([
  "id",
  "target",
  "payload",
  "metadata",
  "aiSummary",
]);

/**
 * Validate a SQL identifier and return it wrapped in double quotes, ready to be
 * interpolated into a raw query. Throws if the identifier is malformed or — when
 * an allowlist is supplied — not a member of it.
 *
 * @param identifier the bare (unquoted) table or column name
 * @param allowlist optional set of permitted identifiers
 */
export function quoteIdentifier(
  identifier: string,
  allowlist?: ReadonlySet<string>,
): string {
  if (typeof identifier !== "string" || !SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(
      `Refusing to interpolate unsafe SQL identifier: ${JSON.stringify(identifier)}`,
    );
  }

  if (allowlist && !allowlist.has(identifier)) {
    throw new Error(
      `SQL identifier ${JSON.stringify(identifier)} is not in the permitted allowlist`,
    );
  }

  return `"${identifier}"`;
}

/**
 * Validate and quote a list of identifiers, returning them as a comma-separated
 * fragment (e.g. `"id", "target", "payload"`) suitable for a SELECT/column list.
 */
export function quoteIdentifierList(
  identifiers: readonly string[],
  allowlist?: ReadonlySet<string>,
): string {
  return identifiers
    .map((identifier) => quoteIdentifier(identifier, allowlist))
    .join(", ");
}
