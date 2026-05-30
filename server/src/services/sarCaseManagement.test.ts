import { describe, it, expect, beforeEach } from "vitest";
import { SarCaseManager, SarCaseStatus } from "./sarCaseManagement";

describe("SarCaseManager", () => {
  let manager: SarCaseManager;

  beforeEach(() => {
    manager = new SarCaseManager();
  });

  it("should create a new SAR case", () => {
    const sarCase = manager.createCase("tenant-1", ["tx-1"], 85, "High velocity of transactions");
    expect(sarCase.id).toBeDefined();
    expect(sarCase.tenantId).toBe("tenant-1");
    expect(sarCase.status).toBe(SarCaseStatus.OPEN);
    expect(sarCase.riskScore).toBe(85);
  });

  it("should reject invalid risk scores", () => {
    expect(() => manager.createCase("tenant-1", ["tx-1"], 105, "Reason")).toThrow("Risk score must be between 0 and 100");
    expect(() => manager.createCase("tenant-1", ["tx-1"], -5, "Reason")).toThrow("Risk score must be between 0 and 100");
  });

  it("should retrieve an existing case", () => {
    const created = manager.createCase("tenant-1", ["tx-1"], 75, "Reason");
    const retrieved = manager.getCase(created.id);
    expect(retrieved).toEqual(created);
  });

  it("should list cases optionally filtered by tenantId", () => {
    manager.createCase("tenant-1", ["tx-1"], 75, "Reason 1");
    manager.createCase("tenant-2", ["tx-2"], 80, "Reason 2");

    expect(manager.listCases()).toHaveLength(2);
    expect(manager.listCases("tenant-1")).toHaveLength(1);
    expect(manager.listCases("tenant-1")[0].tenantId).toBe("tenant-1");
  });

  it("should update case status and add a note", () => {
    const created = manager.createCase("tenant-1", ["tx-1"], 75, "Reason");
    const updated = manager.updateCaseStatus(created.id, SarCaseStatus.UNDER_REVIEW, "Officer started review");
    
    expect(updated.status).toBe(SarCaseStatus.UNDER_REVIEW);
    expect(updated.officerNotes).toContain("Officer started review");
  });

  it("should prevent updating a closed case", () => {
    const created = manager.createCase("tenant-1", ["tx-1"], 75, "Reason");
    manager.updateCaseStatus(created.id, SarCaseStatus.DISMISSED);

    expect(() => manager.updateCaseStatus(created.id, SarCaseStatus.UNDER_REVIEW)).toThrow("Cannot update a closed SAR case");
  });

  it("should add a note to an existing case without changing status", () => {
    const created = manager.createCase("tenant-1", ["tx-1"], 75, "Reason");
    const updated = manager.addNote(created.id, "Checking external logs");
    
    expect(updated.officerNotes).toContain("Checking external logs");
  });
});