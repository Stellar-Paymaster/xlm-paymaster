import { describe, expect, it } from "vitest";

import {
  AUDIT_LOG_COLUMN_ALLOWLIST,
  ERASURE_TABLE_ALLOWLIST,
  quoteIdentifier,
  quoteIdentifierList,
} from "./sqlIdentifiers";

describe("quoteIdentifier", () => {
  it("double-quotes a valid bare identifier", () => {
    expect(quoteIdentifier("AuditLog")).toBe(`"AuditLog"`);
    expect(quoteIdentifier("tenantId")).toBe(`"tenantId"`);
    expect(quoteIdentifier("_private0")).toBe(`"_private0"`);
  });

  it("accepts identifiers that are members of an allowlist", () => {
    expect(quoteIdentifier("WebhookDelivery", ERASURE_TABLE_ALLOWLIST)).toBe(
      `"WebhookDelivery"`,
    );
    expect(quoteIdentifier("payload", AUDIT_LOG_COLUMN_ALLOWLIST)).toBe(
      `"payload"`,
    );
  });

  it("rejects a well-formed identifier that is absent from the allowlist", () => {
    expect(() => quoteIdentifier("AdminUser", ERASURE_TABLE_ALLOWLIST)).toThrow(
      /not in the permitted allowlist/,
    );
  });

  it.each([
    `tenantId"; DROP TABLE Tenant; --`,
    `tenantId" --`,
    `; DELETE FROM Tenant`,
    `tenant Id`,
    `tenant-id`,
    `"; --`,
    ``,
    `1tenant`,
    `tenant);`,
  ])("rejects the injection-shaped identifier %j", (malicious) => {
    expect(() => quoteIdentifier(malicious)).toThrow(/unsafe SQL identifier/);
  });

  it("rejects non-string identifiers", () => {
    // @ts-expect-error exercising a runtime guard against bad callers
    expect(() => quoteIdentifier(undefined)).toThrow(/unsafe SQL identifier/);
    // @ts-expect-error exercising a runtime guard against bad callers
    expect(() => quoteIdentifier(42)).toThrow(/unsafe SQL identifier/);
  });
});

describe("quoteIdentifierList", () => {
  it("validates and joins a column list", () => {
    expect(
      quoteIdentifierList(
        ["id", "target", "payload", "metadata", "aiSummary"],
        AUDIT_LOG_COLUMN_ALLOWLIST,
      ),
    ).toBe(`"id", "target", "payload", "metadata", "aiSummary"`);
  });

  it("throws if any member of the list is unsafe", () => {
    expect(() =>
      quoteIdentifierList(["id", `payload" = '' OR 1=1 --`]),
    ).toThrow(/unsafe SQL identifier/);
  });
});
