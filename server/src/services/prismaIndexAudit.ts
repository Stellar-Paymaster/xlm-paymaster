import { readFileSync } from "fs";
import path from "path";

export interface RequiredPrismaIndex {
  model: string;
  fields: string[];
  reason: string;
}

export interface PrismaIndexAuditResult {
  checkedAt: Date;
  missing: RequiredPrismaIndex[];
  passed: RequiredPrismaIndex[];
}

interface ParsedModel {
  indexes: string[][];
}

export const REQUIRED_PRISMA_INDEXES: RequiredPrismaIndex[] = [
  {
    model: "Transaction",
    fields: ["tenantId", "status", "createdAt"],
    reason: "Tenant transaction history and quota reconciliation filter by tenant, status, and recency.",
  },
  {
    model: "Transaction",
    fields: ["status", "createdAt"],
    reason: "Ledger and admin workflows scan large transaction tables by lifecycle state and age.",
  },
  {
    model: "Transaction",
    fields: ["chain", "createdAt"],
    reason: "Cross-chain analytics and settlement views group transaction volume by chain over time.",
  },
  {
    model: "AuditLog",
    fields: ["actor", "timestamp"],
    reason: "Compliance investigations fetch actor timelines from the audit log.",
  },
  {
    model: "AuditLog",
    fields: ["action", "timestamp"],
    reason: "Admin activity exports filter actions across large audit tables.",
  },
  {
    model: "AuditLog",
    fields: ["eventType", "timestamp"],
    reason: "SOC2 and security event reports filter event types by recency.",
  },
  {
    model: "AuditLog",
    fields: ["target", "timestamp"],
    reason: "Resource-level investigations need indexed target timelines.",
  },
];

function parseIndexFields(line: string): string[] | null {
  const match = line.match(/@@(?:index|unique)\s*\(\s*\[([^\]]+)\]/);
  if (!match) {
    return null;
  }

  return match[1]
    .split(",")
    .map((field) => field.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function parsePrismaModels(schema: string): Map<string, ParsedModel> {
  const models = new Map<string, ParsedModel>();
  let activeModel: string | undefined;
  let depth = 0;

  for (const rawLine of schema.split(/\r?\n/)) {
    const line = rawLine.trim();
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);

    if (modelMatch) {
      activeModel = modelMatch[1];
      depth = 1;
      models.set(activeModel, { indexes: [] });
      continue;
    }

    if (!activeModel) {
      continue;
    }

    const indexFields = parseIndexFields(line);
    if (indexFields) {
      models.get(activeModel)?.indexes.push(indexFields);
    }

    depth += (rawLine.match(/\{/g) ?? []).length;
    depth -= (rawLine.match(/\}/g) ?? []).length;

    if (depth <= 0) {
      activeModel = undefined;
      depth = 0;
    }
  }

  return models;
}

function hasIndex(model: ParsedModel | undefined, fields: string[]): boolean {
  if (!model) {
    return false;
  }

  return model.indexes.some((candidate) => {
    if (candidate.length < fields.length) {
      return false;
    }

    return fields.every((field, index) => candidate[index] === field);
  });
}

export function auditPrismaIndexes(
  schema: string,
  requiredIndexes: RequiredPrismaIndex[] = REQUIRED_PRISMA_INDEXES,
  now: Date = new Date(),
): PrismaIndexAuditResult {
  const models = parsePrismaModels(schema);
  const missing: RequiredPrismaIndex[] = [];
  const passed: RequiredPrismaIndex[] = [];

  for (const required of requiredIndexes) {
    if (hasIndex(models.get(required.model), required.fields)) {
      passed.push(required);
    } else {
      missing.push(required);
    }
  }

  return {
    checkedAt: now,
    missing,
    passed,
  };
}

export function auditPrismaSchemaFile(
  schemaPath = path.resolve(process.cwd(), "prisma/schema.prisma"),
): PrismaIndexAuditResult {
  return auditPrismaIndexes(readFileSync(schemaPath, "utf8"));
}

if (require.main === module) {
  const result = auditPrismaSchemaFile();
  const payload = {
    checkedAt: result.checkedAt.toISOString(),
    missing: result.missing,
    passed: result.passed.length,
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (result.missing.length > 0) {
    process.exitCode = 1;
  }
}
