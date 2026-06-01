/**
 * RBAC permission definitions for the admin dashboard.
 *
 * Roles (least → most privileged):
 *   READ_ONLY   – view-only access across all sections
 *   BILLING     – billing/payment operations + limited read access
 *   ADMIN       – full operational control except user management
 *   SUPER_ADMIN – unrestricted access including user management
 */

export const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "READ_ONLY", "BILLING"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const PERMISSIONS = [
  // Transactions & analytics
  "view_transactions",
  "view_analytics",
  // API keys
  "view_api_keys",
  "manage_api_keys",
  // Tenants & subscription tiers
  "view_tenants",
  "manage_tenants",
  // Signing pool
  "view_signers",
  "manage_signers",
  // Configuration (fee multiplier, rate limits, chains)
  "manage_config",
  // Audit logs
  "view_audit_logs",
  // SAR / flagged events
  "view_sar",
  "manage_sar",
  // Billing / payments
  "view_billing",
  "manage_billing",
  // Admin user management (SUPER_ADMIN only)
  "manage_users",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set(PERMISSIONS),

  ADMIN: new Set<Permission>([
    "view_transactions",
    "view_analytics",
    "view_api_keys",
    "manage_api_keys",
    "view_tenants",
    "manage_tenants",
    "view_signers",
    "manage_signers",
    "manage_config",
    "view_audit_logs",
    "view_sar",
    "manage_sar",
    "view_billing",
  ]),

  READ_ONLY: new Set<Permission>([
    "view_transactions",
    "view_analytics",
    "view_api_keys",
    "view_tenants",
    "view_signers",
    "view_audit_logs",
    "view_sar",
    "view_billing",
  ]),

  BILLING: new Set<Permission>([
    "view_transactions",
    "view_analytics",
    "view_tenants",
    "view_billing",
    "manage_billing",
  ]),
};

export function hasPermission(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function isValidRole(role: string): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}
