import { describe, expect, it } from "vitest";
import { buildAuditTrailSnapshot } from "./audit-trail-snapshots";

describe("buildAuditTrailSnapshot", () => {
  it("returns changed fields between two metadata objects", () => {
    const snapshot = buildAuditTrailSnapshot(
      {
        id: "new",
        action: "tenant.update",
        metadata: JSON.stringify({ tier: "enterprise", retries: 3 }),
      },
      {
        id: "old",
        action: "tenant.update",
        metadata: JSON.stringify({ tier: "pro", retries: 3 }),
      },
    );

    expect(snapshot.hasChanges).toBe(true);
    expect(snapshot.changes).toEqual([
      {
        field: "tier",
        before: "pro",
        after: "enterprise",
      },
    ]);
  });

  it("handles invalid metadata payloads", () => {
    const snapshot = buildAuditTrailSnapshot(
      { id: "new", action: "config.set", metadata: "{invalid" },
      { id: "old", action: "config.set", metadata: null },
    );

    expect(snapshot.hasChanges).toBe(true);
    expect(snapshot.changes[0]?.field).toBe("_raw");
  });

  it("returns no baseline summary when previous entry does not exist", () => {
    const snapshot = buildAuditTrailSnapshot(
      { id: "new", action: "tenant.create", metadata: JSON.stringify({ id: "t_1" }) },
      null,
    );

    expect(snapshot.hasChanges).toBe(false);
    expect(snapshot.summary).toContain("No baseline entry");
  });
});
