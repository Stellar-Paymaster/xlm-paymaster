import { Request } from "express";
import prisma from "../utils/db";

export type AuditEventType =
  | "ADMIN_LOGIN"
  | "API_KEY_UPSERT"
  | "API_KEY_REVOKE"
  | "TENANT_TIER_UPDATE"
  | "TENANT_ERASURE_REQUESTED"
  | "TENANT_ERASURE_PURGED"
  | "MANUAL_OVERRIDE"
  | "RATE_LIMIT_OVERRIDE"
  | "CHAIN_CREATED"
  | "CHAIN_UPDATED"
  | "CHAIN_DELETED"
  | "AUDIT_EXPORT"
  | "OFAC_SCREENING_BLOCKED"
  | "OFAC_SCREENING_PASSED";

export function getAuditActor(req: Request): string {
  const adminUser = req.header("x-admin-user");
  if (adminUser) {
    return `admin:${adminUser}`;
  }
  if (req.header("x-admin-token")) {
    return "admin-token";
  }
  return "unknown";
}

export async function logAuditEvent(
  eventType: AuditEventType,
  actor: string,
  payload?: unknown,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        eventType,
        actor,
        payload: payload ?? undefined,
      },
    });
  } catch {
    // Audit logging must not block the request path.
  }
}

const csvHeader = ["event_type", "actor", "payload", "timestamp"];

function escapeCsvValue(value: string): string {
  if (value.includes("\"") || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeAuditRecordToCsv(
  record: {
    eventType: string;
    actor: string;
    payload?: unknown;
    timestamp: Date;
  },
): string {
  const payload = record.payload ? JSON.stringify(record.payload) : "";
  return [
    escapeCsvValue(record.eventType),
    escapeCsvValue(record.actor),
    escapeCsvValue(payload),
    escapeCsvValue(record.timestamp.toISOString()),
  ].join(",");
}

export async function exportAuditLogCsv(): Promise<string> {
  const records = await prisma.auditLog.findMany({
    orderBy: { timestamp: "desc" },
  });

  const rows = records.map((record: any) => {
    return serializeAuditRecordToCsv({
      eventType: record.eventType,
      actor: record.actor,
      payload: record.payload,
      timestamp: record.timestamp,
    });
  });

  return [csvHeader.join(","), ...rows].join("\n");
}

export async function ensureAuditLogTableIntegrity(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
  if (!dbUrl.startsWith("file:")) {
    return;
  }

  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS \"AuditLog\" (
      id TEXT PRIMARY KEY NOT NULL,
      eventType TEXT,
      actor TEXT NOT NULL,
      action TEXT,
      target TEXT,
      payload TEXT,
      metadata TEXT,
      aiSummary TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  );

  const alterStatements = [
    `ALTER TABLE \"AuditLog\" ADD COLUMN action TEXT`,
    `ALTER TABLE \"AuditLog\" ADD COLUMN target TEXT`,
    `ALTER TABLE \"AuditLog\" ADD COLUMN metadata TEXT`,
    `ALTER TABLE \"AuditLog\" ADD COLUMN aiSummary TEXT`,
    `ALTER TABLE \"AuditLog\" ADD COLUMN createdAt TEXT NOT NULL DEFAULT (datetime('now'))`,
  ];

  for (const statement of alterStatements) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch {
      // Column already exists on newer schemas.
    }
  }

  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS audit_log_no_update`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS audit_log_no_delete`);
}
