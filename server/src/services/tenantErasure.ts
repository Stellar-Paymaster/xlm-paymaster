import { AppError } from "../errors/AppError";
import { deleteApiKey } from "../middleware/apiKeys";
import { logAuditEvent } from "./auditLogger";
import prisma from "../utils/db";
import { createLogger, serializeError } from "../utils/logger";

const logger = createLogger({ component: "tenant_erasure" });

const AUDIT_LOG_TABLE = "AuditLog";
const PII_PLACEHOLDER = "[redacted]";
const DELETED_TENANT_NAME = "Deleted tenant";
const DEFAULT_RETENTION_DAYS = 30;

const tenantModel = (prisma as any).tenant as {
  findUnique: (args: any) => Promise<any | null>;
  findMany: (args: any) => Promise<any[]>;
  update: (args: any) => Promise<any>;
  delete: (args: any) => Promise<any>;
};

const apiKeyModel = (prisma as any).apiKey as {
  findMany: (args: any) => Promise<any[]>;
  deleteMany: (args: any) => Promise<any>;
};

const pendingRegistrationModel = (prisma as any).pendingRegistration as {
  findFirst?: (args: any) => Promise<any | null>;
  deleteMany?: (args: any) => Promise<any>;
};

export interface TenantErasureResult {
  tenantId: string;
  deletedAt: string;
  scheduledPurgeAt: string;
  confirmationEmailSent: boolean;
  alreadyScheduled: boolean;
}

function getRetentionDays(): number {
  const configured = Number.parseInt(
    process.env.GDPR_ERASURE_RETENTION_DAYS ?? `${DEFAULT_RETENTION_DAYS}`,
    10,
  );

  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_RETENTION_DAYS;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildConfirmationEmail(opts: {
  projectName: string;
  scheduledPurgeAt: Date;
}): { subject: string; html: string; text: string } {
  const subject = "[Fluid] Your tenant data deletion has been scheduled";
  const purgeDate = opts.scheduledPurgeAt.toISOString().slice(0, 10);
  const safeProjectName = opts.projectName
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:40px auto;color:#1e293b;">
  <h1 style="color:#0f172a;">Tenant deletion scheduled</h1>
  <p>The tenant profile for <strong>${safeProjectName}</strong> has been deleted from active use.</p>
  <p>API keys have been revoked and historical transaction records have been anonymised.</p>
  <p>Any remaining soft-deleted tenant data will be permanently purged on <strong>${purgeDate}</strong>.</p>
</body>
</html>`;

  const text =
    `Tenant deletion scheduled\n\n` +
    `Project: ${opts.projectName}\n` +
    `API keys revoked and transaction history anonymised.\n` +
    `Permanent purge date: ${purgeDate}`;

  return { subject, html, text };
}

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.RESEND_EMAIL_FROM ||
    process.env.FLUID_ALERT_EMAIL_FROM ||
    "noreply@fluid.dev";

  if (resendApiKey) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Resend API error ${response.status}: ${body}`);
    }

    return true;
  }

  const smtpHost = process.env.FLUID_ALERT_SMTP_HOST;
  if (smtpHost) {
    const nodemailer = require("nodemailer") as {
      createTransport: (config: any) => { sendMail: (msg: any) => Promise<unknown> };
    };

    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.FLUID_ALERT_SMTP_PORT ?? 587),
      secure: process.env.FLUID_ALERT_SMTP_SECURE === "true",
      ...(process.env.FLUID_ALERT_SMTP_USER
        ? {
            auth: {
              user: process.env.FLUID_ALERT_SMTP_USER,
              pass: process.env.FLUID_ALERT_SMTP_PASS ?? "",
            },
          }
        : {}),
    });

    await transport.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });

    return true;
  }

  logger.info("No email transport configured for tenant erasure confirmations");
  return false;
}

async function resolveContactEmail(
  tenantId: string,
  currentName: string,
  currentEmail?: string | null,
): Promise<string | null> {
  if (currentEmail) {
    return currentEmail;
  }

  if (!pendingRegistrationModel?.findFirst) {
    return null;
  }

  const registration = await pendingRegistrationModel.findFirst({
    where: {
      projectName: currentName,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!registration?.email) {
    logger.info({ tenant_marker: tenantId.slice(0, 8) }, "Tenant erasure proceeding without contact email");
    return null;
  }

  return registration.email;
}

function scrubText(value: string, secrets: string[]): string {
  let scrubbed = value;

  for (const secret of secrets) {
    if (!secret) {
      continue;
    }
    scrubbed = scrubbed.split(secret).join(PII_PLACEHOLDER);
  }

  return scrubbed;
}

async function scrubAuditLogs(details: {
  tenantId: string;
  tenantName: string;
  contactEmail: string | null;
  apiKeys: string[];
}): Promise<void> {
  try {
    const columns = await prisma.$queryRawUnsafe(
      `PRAGMA table_info("${AUDIT_LOG_TABLE}")`,
    ) as Array<{ name?: string }>;
    const columnSet = new Set(
      columns
        .map((column) => column.name)
        .filter((name): name is string => typeof name === "string"),
    );

    if (!columnSet.has("id")) {
      return;
    }

    const scrubCandidates = ["target", "payload", "metadata", "aiSummary"].filter(
      (column) => columnSet.has(column),
    );

    if (scrubCandidates.length === 0) {
      return;
    }

    const rows = await prisma.$queryRawUnsafe(
      `SELECT "id", ${scrubCandidates.map((column) => `"${column}"`).join(", ")} FROM "${AUDIT_LOG_TABLE}"`,
    ) as Array<Record<string, unknown>>;

    const secrets = [
      details.tenantId,
      details.tenantName,
      details.contactEmail ?? "",
      ...details.apiKeys,
    ].filter((value) => value.length > 0);

    for (const row of rows) {
      const assignments: string[] = [];
      const params: unknown[] = [];

      for (const column of scrubCandidates) {
        const currentValue = row[column];
        if (typeof currentValue !== "string") {
          continue;
        }

        const nextValue = scrubText(currentValue, secrets);
        if (nextValue === currentValue) {
          continue;
        }

        assignments.push(`"${column}" = ?`);
        params.push(nextValue);
      }

      if (assignments.length === 0) {
        continue;
      }

      params.push(row.id);
      await prisma.$executeRawUnsafe(
        `UPDATE "${AUDIT_LOG_TABLE}" SET ${assignments.join(", ")} WHERE "id" = ?`,
        ...params,
      );
    }
  } catch (error) {
    logger.warn(
      { ...serializeError(error) },
      "Failed to scrub audit-log PII during tenant erasure",
    );
  }
}

async function sendDeletionConfirmation(
  tenantName: string,
  contactEmail: string | null,
  scheduledPurgeAt: Date,
): Promise<boolean> {
  if (!contactEmail) {
    return false;
  }

  const message = buildConfirmationEmail({
    projectName: tenantName,
    scheduledPurgeAt,
  });

  try {
    return await sendEmail({
      to: contactEmail,
      ...message,
    });
  } catch (error) {
    logger.error(
      { ...serializeError(error) },
      "Failed to send tenant erasure confirmation email",
    );
    return false;
  }
}

export async function requestTenantErasure(input: {
  tenantId: string;
  actor: string;
}): Promise<TenantErasureResult> {
  const tenant = await tenantModel.findUnique({
    where: { id: input.tenantId },
    select: {
      id: true,
      name: true,
      contactEmail: true,
      deletedAt: true,
      scheduledPurgeAt: true,
    },
  });

  if (!tenant) {
    throw new AppError("Tenant not found", 404, "NOT_FOUND");
  }

  if (tenant.deletedAt && tenant.scheduledPurgeAt) {
    return {
      tenantId: tenant.id,
      deletedAt: tenant.deletedAt.toISOString(),
      scheduledPurgeAt: tenant.scheduledPurgeAt.toISOString(),
      confirmationEmailSent: false,
      alreadyScheduled: true,
    };
  }

  const apiKeys = await apiKeyModel.findMany({
    where: { tenantId: tenant.id },
    select: { key: true },
  });

  const contactEmail = await resolveContactEmail(
    tenant.id,
    tenant.name,
    tenant.contactEmail,
  );

  const deletedAt = new Date();
  const scheduledPurgeAt = addDays(deletedAt, getRetentionDays());

  await (prisma as any).$transaction(async (tx: any) => {
    await tx.transaction.updateMany({
      where: { tenantId: tenant.id },
      data: { tenantId: null },
    });

    await tx.apiKey.deleteMany({
      where: { tenantId: tenant.id },
    });

    if (contactEmail && tx.pendingRegistration?.deleteMany) {
      await tx.pendingRegistration.deleteMany({
        where: { email: contactEmail },
      });
    }

    await tx.tenant.update({
      where: { id: tenant.id },
      data: {
        name: DELETED_TENANT_NAME,
        contactEmail: null,
        webhookUrl: null,
        webhookSecret: null,
        webhookEventTypes: null,
        deletedAt,
        erasureRequestedAt: deletedAt,
        scheduledPurgeAt,
      },
    });
  });

  for (const apiKey of apiKeys) {
    deleteApiKey(apiKey.key);
  }

  await scrubAuditLogs({
    tenantId: tenant.id,
    tenantName: tenant.name,
    contactEmail,
    apiKeys: apiKeys.map((apiKey) => apiKey.key),
  });

  const confirmationEmailSent = await sendDeletionConfirmation(
    tenant.name,
    contactEmail,
    scheduledPurgeAt,
  );

  void logAuditEvent("TENANT_ERASURE_REQUESTED", input.actor, {
    tenantId: PII_PLACEHOLDER,
    scheduledPurgeAt: scheduledPurgeAt.toISOString(),
  });

  logger.info(
    { scheduledPurgeAt: scheduledPurgeAt.toISOString() },
    "Tenant erasure scheduled",
  );

  return {
    tenantId: tenant.id,
    deletedAt: deletedAt.toISOString(),
    scheduledPurgeAt: scheduledPurgeAt.toISOString(),
    confirmationEmailSent,
    alreadyScheduled: false,
  };
}

async function getExistingTables(): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type = 'table'`,
  ) as Array<{ name?: string }>;

  return new Set(
    rows
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string"),
  );
}

async function deleteRowsByTenantId(
  tables: Set<string>,
  tableName: string,
  tenantId: string,
): Promise<void> {
  if (!tables.has(tableName)) {
    return;
  }

  await prisma.$executeRawUnsafe(
    `DELETE FROM "${tableName}" WHERE "tenantId" = ?`,
    tenantId,
  );
}

export async function purgeExpiredTenantErasures(
  now: Date = new Date(),
): Promise<number> {
  const tenants = await tenantModel.findMany({
    where: {
      deletedAt: { not: null },
      scheduledPurgeAt: { lte: now },
    },
    select: {
      id: true,
    },
  });

  if (tenants.length === 0) {
    return 0;
  }

  const tables = await getExistingTables();

  for (const tenant of tenants) {
    await deleteRowsByTenantId(tables, "WebhookDlq", tenant.id);
    await deleteRowsByTenantId(tables, "WebhookDelivery", tenant.id);
    await deleteRowsByTenantId(tables, "QuotaTopUp", tenant.id);
    await deleteRowsByTenantId(tables, "Payment", tenant.id);
    await deleteRowsByTenantId(tables, "SponsoredTransaction", tenant.id);
    await deleteRowsByTenantId(tables, "TenantUsageStats", tenant.id);
    await deleteRowsByTenantId(tables, "TierAdjustment", tenant.id);
    await deleteRowsByTenantId(tables, "ApiKey", tenant.id);

    if (tables.has("Transaction")) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Transaction" SET "tenantId" = NULL WHERE "tenantId" = ?`,
        tenant.id,
      );
    }

    await tenantModel.delete({
      where: { id: tenant.id },
    });

    void logAuditEvent("TENANT_ERASURE_PURGED", "system", {
      tenantId: PII_PLACEHOLDER,
      purgedAt: now.toISOString(),
    });
  }

  logger.info({ purgedCount: tenants.length }, "Purged soft-deleted tenants");
  return tenants.length;
}
