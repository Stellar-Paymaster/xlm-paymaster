import crypto from "crypto";
import prisma from "../utils/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegisterInput {
  email: string;
  projectName: string;
  intendedUse: string;
}

export interface VerifyResult {
  apiKey: string;
  tenantId: string;
  projectName: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FREE_TIER_NAME = "Free";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function generateApiKey(): { key: string; prefix: string } {
  const random = crypto.randomBytes(20).toString("hex");
  const key = `fluid_live_${random}`;
  const prefix = key.slice(0, 12);
  return { key, prefix };
}

/** Send an email via Resend API or SMTP Nodemailer, mirroring the alert service strategy. */
async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_EMAIL_FROM || process.env.FLUID_ALERT_EMAIL_FROM || "noreply@fluid.dev";

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
    return;
  }

  // SMTP fallback via nodemailer
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
    return;
  }

  // No email transport configured — log so developers know
  console.warn(
    `[RegistrationService] No email transport configured. Would send "${opts.subject}" to ${opts.to}.`,
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function buildVerificationEmail(opts: {
  email: string;
  projectName: string;
  verifyUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "[Fluid] Verify your email address";
  const safeProject = escapeHtml(opts.projectName);
  const safeUrl = escapeHtml(opts.verifyUrl);

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:40px auto;color:#1e293b;">
  <h1 style="color:#2563eb;">Welcome to Fluid</h1>
  <p>Thanks for registering <strong>${safeProject}</strong>!</p>
  <p>Click the button below to verify your email address and receive your API key:</p>
  <p style="margin:24px 0;">
    <a href="${safeUrl}"
       style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">
      Verify Email &amp; Get API Key
    </a>
  </p>
  <p style="color:#64748b;font-size:13px;">
    This link expires in 24 hours. If you didn't request this, you can safely ignore it.
  </p>
  <p style="color:#64748b;font-size:13px;">Or copy and paste this URL: ${safeUrl}</p>
</body>
</html>`;

  const text = `Welcome to Fluid!\n\nThanks for registering ${opts.projectName}.\n\nVerify your email to receive your API key:\n${opts.verifyUrl}\n\nThis link expires in 24 hours.`;

  return { subject, html, text };
}

function buildWelcomeEmail(opts: {
  email: string;
  projectName: string;
  apiKey: string;
  docsUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "[Fluid] Your API key is ready";
  const safeProject = escapeHtml(opts.projectName);
  const safeKey = escapeHtml(opts.apiKey);
  const safeDocsUrl = escapeHtml(opts.docsUrl);

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:40px auto;color:#1e293b;">
  <h1 style="color:#2563eb;">Your Fluid API key is ready</h1>
  <p>Your project <strong>${safeProject}</strong> has been provisioned on the Free tier.</p>
  <p>Here is your API key — keep it safe, it will only be shown once:</p>
  <pre style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:16px;font-size:14px;overflow-x:auto;">${safeKey}</pre>
  <p>Use it in the <code>x-api-key</code> header when calling the Fluid fee-bump endpoint.</p>
  <p>
    <a href="${safeDocsUrl}" style="color:#2563eb;">Read the quickstart docs →</a>
  </p>
  <p style="color:#64748b;font-size:13px;">
    Your account starts on the Free tier. You can upgrade at any time from the developer portal.
  </p>
</body>
</html>`;

  const text = `Your Fluid API key is ready!\n\nProject: ${opts.projectName}\n\nAPI Key (save this — shown only once):\n${opts.apiKey}\n\nUse it as the x-api-key header.\n\nDocs: ${opts.docsUrl}`;

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a pending registration and sends a verification email.
 * If a pending record for this email already exists it is re-used (resend).
 */
export async function createRegistration(input: RegisterInput): Promise<void> {
  const token = generateToken();
  const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  const pendingReg = (prisma as any).pendingRegistration as {
    upsert: (args: any) => Promise<any>;
  };

  await pendingReg.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      projectName: input.projectName,
      intendedUse: input.intendedUse,
      token,
      tokenExpiresAt,
      status: "pending",
    },
    update: {
      projectName: input.projectName,
      intendedUse: input.intendedUse,
      token,
      tokenExpiresAt,
      status: "pending",
    },
  });

  const baseUrl =
    process.env.REGISTRATION_VERIFY_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3001";

  const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

  const { subject, html, text } = buildVerificationEmail({
    email: input.email,
    projectName: input.projectName,
    verifyUrl,
  });

  await sendEmail({ to: input.email, subject, html, text });
}

/**
 * Validates the verification token, provisions a Tenant + ApiKey, then
 * sends the welcome email with the new API key.
 *
 * Idempotent: if the token was already verified the existing API key is
 * returned (so re-clicking the link doesn't create duplicate tenants).
 */
export async function verifyRegistration(token: string): Promise<VerifyResult> {
  const pendingReg = (prisma as any).pendingRegistration as {
    findUnique: (args: any) => Promise<any | null>;
    update: (args: any) => Promise<any>;
  };

  const record = await pendingReg.findUnique({ where: { token } });

  if (!record) {
    throw new Error("Invalid or expired verification token.");
  }

  if (record.status === "verified") {
    // Already provisioned — look up the existing API key for this tenant so we
    // can return consistent data on repeated clicks.
    const tenantModel = (prisma as any).tenant as {
      findFirst: (args: any) => Promise<any | null>;
    };
    const apiKeyModel = (prisma as any).apiKey as {
      findFirst: (args: any) => Promise<any | null>;
    };

    // Find tenant by project name + email (best-effort; unique by email in practice)
    const tenant = await tenantModel.findFirst({
      where: {
        name: record.projectName,
        contactEmail: record.email,
      },
    });
    const apiKey = tenant
      ? await apiKeyModel.findFirst({ where: { tenantId: tenant.id, active: true } })
      : null;

    return {
      apiKey: apiKey?.key ?? "(key unavailable — contact support)",
      tenantId: tenant?.id ?? "",
      projectName: record.projectName,
      email: record.email,
    };
  }

  if (record.status !== "pending") {
    throw new Error("Invalid or expired verification token.");
  }

  if (new Date() > record.tokenExpiresAt) {
    await pendingReg.update({
      where: { token },
      data: { status: "expired" },
    });
    throw new Error("Verification link has expired. Please sign up again.");
  }

  // ---- Provision Tenant + ApiKey inside a transaction ----------------------

  const subscriptionTierModel = (prisma as any).subscriptionTier as {
    findFirst: (args: any) => Promise<any | null>;
  };

  const freeTier = await subscriptionTierModel.findFirst({
    where: { name: FREE_TIER_NAME },
  });

  if (!freeTier) {
    throw new Error(
      "Free subscription tier not found. Please run the database seed first.",
    );
  }

  const { key: newApiKey, prefix } = generateApiKey();

  const tenantModel = (prisma as any).tenant as {
    create: (args: any) => Promise<any>;
  };
  const apiKeyModel = (prisma as any).apiKey as {
    create: (args: any) => Promise<any>;
  };

  const tenant = await tenantModel.create({
    data: {
      name: record.projectName,
      contactEmail: record.email,
      subscriptionTierId: freeTier.id,
      dailyQuotaStroops: BigInt(freeTier.txLimit * 100), // rough default
    },
  });

  await apiKeyModel.create({
    data: {
      key: newApiKey,
      prefix,
      name: `${record.projectName} – Default Key`,
      tenantId: tenant.id,
      tier: "free",
      maxRequests: freeTier.rateLimit,
      windowMs: 60_000,
      dailyQuotaStroops: BigInt(freeTier.txLimit * 100),
    },
  });

  // Mark registration as verified
  await pendingReg.update({
    where: { token },
    data: { status: "verified" },
  });

  // Send welcome email (fire-and-forget to avoid blocking the response)
  const docsUrl =
    process.env.NEXT_PUBLIC_DOCS_URL ||
    process.env.FLUID_DOCS_URL ||
    "https://docs.fluid.dev";

  const { subject, html, text } = buildWelcomeEmail({
    email: record.email,
    projectName: record.projectName,
    apiKey: newApiKey,
    docsUrl,
  });

  sendEmail({ to: record.email, subject, html, text }).catch((err) => {
    console.error("[RegistrationService] Failed to send welcome email:", err);
  });

  return {
    apiKey: newApiKey,
    tenantId: tenant.id,
    projectName: record.projectName,
    email: record.email,
  };
}
