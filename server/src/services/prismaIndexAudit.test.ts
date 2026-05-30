import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_PRISMA_INDEXES,
  auditPrismaIndexes,
} from "./prismaIndexAudit";

describe("auditPrismaIndexes", () => {
  it("passes the committed Prisma schema index requirements", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const result = auditPrismaIndexes(
      schema,
      REQUIRED_PRISMA_INDEXES,
      new Date("2026-04-23T00:00:00.000Z"),
    );

    expect(result.missing).toEqual([]);
    expect(result.passed).toHaveLength(REQUIRED_PRISMA_INDEXES.length);
  });

  it("reports missing compound indexes with model and field details", () => {
    const schema = `
      model Transaction {
        id String @id
        tenantId String?
        status String
        chain String
        createdAt DateTime
      }

      model AuditLog {
        id String @id
        actor String
        action String?
        eventType String?
        target String?
        timestamp DateTime
      }
    `;

    const result = auditPrismaIndexes(schema);

    expect(result.missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fields: ["tenantId", "status", "createdAt"],
          model: "Transaction",
        }),
        expect.objectContaining({
          fields: ["actor", "timestamp"],
          model: "AuditLog",
        }),
      ]),
    );
  });
});
