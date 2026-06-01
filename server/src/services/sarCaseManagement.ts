import { randomUUID } from "crypto";

export enum SarCaseStatus {
  OPEN = "OPEN",
  UNDER_REVIEW = "UNDER_REVIEW",
  FILED = "FILED",
  DISMISSED = "DISMISSED",
}

export interface SarCase {
  id: string;
  tenantId: string;
  transactionIds: string[];
  status: SarCaseStatus;
  riskScore: number;
  flaggedReason: string;
  officerNotes: string[];
  createdAt: number;
  updatedAt: number;
}

export class SarCaseManager {
  // Simulating the datastore for the workflow
  private cases: Map<string, SarCase> = new Map();

  /**
   * Automatically generate a new SAR Case when a high-risk condition is met.
   */
  public createCase(
    tenantId: string,
    transactionIds: string[],
    riskScore: number,
    flaggedReason: string
  ): SarCase {
    if (riskScore < 0 || riskScore > 100) {
      throw new Error("Risk score must be between 0 and 100");
    }

    const newCase: SarCase = {
      id: randomUUID(),
      tenantId,
      transactionIds,
      status: SarCaseStatus.OPEN,
      riskScore,
      flaggedReason,
      officerNotes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.cases.set(newCase.id, newCase);
    return newCase;
  }

  public getCase(id: string): SarCase | undefined {
    return this.cases.get(id);
  }

  public listCases(tenantId?: string): SarCase[] {
    const allCases = Array.from(this.cases.values());
    if (tenantId) {
      return allCases.filter((c) => c.tenantId === tenantId);
    }
    return allCases;
  }

  public updateCaseStatus(id: string, status: SarCaseStatus, note?: string): SarCase {
    const existing = this.cases.get(id);
    if (!existing) {
      throw new Error(`SAR case with id ${id} not found`);
    }

    // Strict state machine checks: prevent tampering with closed cases
    if (existing.status === SarCaseStatus.FILED || existing.status === SarCaseStatus.DISMISSED) {
       throw new Error(`Cannot update a closed SAR case`);
    }

    existing.status = status;
    existing.updatedAt = Date.now();
    
    if (note) {
      existing.officerNotes.push(note);
    }

    return existing;
  }

  public addNote(id: string, note: string): SarCase {
    const existing = this.cases.get(id);
    if (!existing) {
      throw new Error(`SAR case with id ${id} not found`);
    }

    existing.officerNotes.push(note);
    existing.updatedAt = Date.now();
    
    return existing;
  }
}