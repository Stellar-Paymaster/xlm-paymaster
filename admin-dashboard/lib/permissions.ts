export const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "READ_ONLY", "BILLING"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  READ_ONLY: "Read Only",
  BILLING: "Billing",
};

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Full access including user management",
  ADMIN: "Full operational control except user and billing management",
  READ_ONLY: "View-only access across all sections",
  BILLING: "Billing and payment operations",
};

export type Permission =
  | "view_transactions" | "view_analytics"
  | "view_api_keys" | "manage_api_keys"
  | "view_tenants" | "manage_tenants"
  | "view_signers" | "manage_signers"
  | "manage_config"
  | "view_audit_logs"
  | "view_sar" | "manage_sar"
  | "view_billing" | "manage_billing"
  | "manage_users";

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set<Permission>([
    "view_transactions", "view_analytics",
    "view_api_keys", "manage_api_keys",
    "view_tenants", "manage_tenants",
    "view_signers", "manage_signers",
    "manage_config",
    "view_audit_logs",
    "view_sar", "manage_sar",
    "view_billing", "manage_billing",
    "manage_users",
  ]),
  ADMIN: new Set<Permission>([
    "view_transactions", "view_analytics",
    "view_api_keys", "manage_api_keys",
    "view_tenants", "manage_tenants",
    "view_signers", "manage_signers",
    "manage_config",
    "view_audit_logs",
    "view_sar", "manage_sar",
    "view_billing",
  ]),
  READ_ONLY: new Set<Permission>([
    "view_transactions", "view_analytics",
    "view_api_keys",
    "view_tenants",
    "view_signers",
    "view_audit_logs",
    "view_sar",
    "view_billing",
  ]),
  BILLING: new Set<Permission>([
    "view_transactions", "view_analytics",
    "view_tenants",
    "view_billing", "manage_billing",
  ]),
};

export function hasPermission(role: AdminRole | string | undefined, permission: Permission): boolean {
  if (!role || !(role in ROLE_PERMISSIONS)) return false;
  return ROLE_PERMISSIONS[role as AdminRole].has(permission);
}

export function isValidRole(role: string): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}
