import { describe, it, expect } from "vitest";
import { hasPermission, isValidRole, ROLE_PERMISSIONS, ADMIN_ROLES } from "./permissions";

describe("hasPermission", () => {
  it("SUPER_ADMIN has every permission", () => {
    expect(hasPermission("SUPER_ADMIN", "manage_users")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "manage_billing")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "manage_config")).toBe(true);
  });

  it("ADMIN cannot manage users", () => {
    expect(hasPermission("ADMIN", "manage_users")).toBe(false);
  });

  it("ADMIN can manage api keys and config", () => {
    expect(hasPermission("ADMIN", "manage_api_keys")).toBe(true);
    expect(hasPermission("ADMIN", "manage_config")).toBe(true);
  });

  it("ADMIN cannot manage billing", () => {
    expect(hasPermission("ADMIN", "manage_billing")).toBe(false);
  });

  it("READ_ONLY can view transactions but not manage them", () => {
    expect(hasPermission("READ_ONLY", "view_transactions")).toBe(true);
    expect(hasPermission("READ_ONLY", "manage_api_keys")).toBe(false);
    expect(hasPermission("READ_ONLY", "manage_config")).toBe(false);
    expect(hasPermission("READ_ONLY", "manage_users")).toBe(false);
  });

  it("BILLING can manage billing but not signers or API keys", () => {
    expect(hasPermission("BILLING", "manage_billing")).toBe(true);
    expect(hasPermission("BILLING", "view_billing")).toBe(true);
    expect(hasPermission("BILLING", "manage_api_keys")).toBe(false);
    expect(hasPermission("BILLING", "manage_signers")).toBe(false);
    expect(hasPermission("BILLING", "view_audit_logs")).toBe(false);
  });
});

describe("isValidRole", () => {
  it("accepts all defined roles", () => {
    for (const role of ADMIN_ROLES) {
      expect(isValidRole(role)).toBe(true);
    }
  });

  it("rejects unknown roles", () => {
    expect(isValidRole("GOD_MODE")).toBe(false);
    expect(isValidRole("")).toBe(false);
    expect(isValidRole("super_admin")).toBe(false); // case-sensitive
  });
});

describe("ROLE_PERMISSIONS coverage", () => {
  it("every role has at least one permission", () => {
    for (const role of ADMIN_ROLES) {
      expect(ROLE_PERMISSIONS[role].size).toBeGreaterThan(0);
    }
  });

  it("SUPER_ADMIN permission set is a superset of ADMIN", () => {
    const superAdminPerms = ROLE_PERMISSIONS["SUPER_ADMIN"];
    const adminPerms = ROLE_PERMISSIONS["ADMIN"];
    for (const perm of adminPerms) {
      expect(superAdminPerms.has(perm)).toBe(true);
    }
  });

  it("READ_ONLY permissions are all view_ prefixed", () => {
    for (const perm of ROLE_PERMISSIONS["READ_ONLY"]) {
      expect(perm.startsWith("view_")).toBe(true);
    }
  });
});
