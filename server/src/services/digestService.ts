import { createLogger, serializeError } from "../utils/logger";
import { aggregateYesterdayStats, type DigestStats } from "./digestAggregator";
import { renderDigestEmail } from "./digestTemplate";
import prisma from "../utils/db";
import crypto from "crypto";

const logger = createLogger({ component: "digest_service" });

const DEFAULT_RESEND_API_URL = "https://api.resend.com/emails";

export interface ResendConfig {
  kind: "resend";
  apiKey: string;
  apiUrl: string;
  from: string;
  to: string[];
}

export interface SmtpConfig {
  kind: "smtp";
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  to: string[];
}

export type DigestEmailTransport = ResendConfig | SmtpConfig;

export interface DigestServiceOptions {
  emailTransport: DigestEmailTransport;
  dashboardUrl?: string;
  unsubscribeBaseUrl?: string;
  unsubscribeSecret?: string;
  fetchImpl?: typeof fetch;
  /** Injected in tests */
  aggregateFn?: typeof aggregateYesterdayStats;
}

export class DigestService {
  private readonly emailTransport: DigestEmailTransport;
  private readonly dashboardUrl?: string;
  private readonly unsubscribeBaseUrl?: string;
  private readonly unsubscribeSecret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly aggregateFn: typeof aggregateYesterdayStats;

  constructor(options: DigestServiceOptions) {
    this.emailTransport = options.emailTransport;
    this.dashboardUrl = options.dashboardUrl;
    this.unsubscribeBaseUrl = options.unsubscribeBaseUrl;
    this.unsubscribeSecret = options.unsubscribeSecret ?? "digest-unsubscribe";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.aggregateFn = options.aggregateFn ?? aggregateYesterdayStats;
  }

  /** Signs an email address to produce a safe unsubscribe token. */
  buildUnsubscribeToken(email: string): string {
    return crypto
      .createHmac("sha256", this.unsubscribeSecret)
      .update(email)
      .digest("hex");
  }

  /** Verify a token for the given email address. */
  verifyUnsubscribeToken(email: string, token: string): boolean {
    const expected = this.buildUnsubscribeToken(email);
    try {
      return crypto.timingSafeEqual(
        Buffer.from(token, "hex"),
        Buffer.from(expected, "hex"),
      );
    } catch {
      return false;
    }
  }

  /**
   * Sends the daily digest for the given reference date.
   * Defaults to "now" — which yields yesterday's stats.
   */
  async sendDigest(
    now: Date = new Date(),
    alertsTriggered: string[] = [],
  ): Promise<void> {
    const recipients = this.emailTransport.to;

    // Filter out unsubscribed addresses
    const activeRecipients: string[] = [];
    for (const email of recipients) {
      const unsub = await this.isUnsubscribed(email);
      if (unsub) {
        logger.info({ email }, "Recipient unsubscribed — skipping digest");
      } else {
        activeRecipients.push(email);
      }
    }

    if (activeRecipients.length === 0) {
      logger.info("All recipients unsubscribed — digest not sent");
      return;
    }

    let stats: DigestStats;
    try {
      stats = await this.aggregateFn(now, alertsTriggered);
    } catch (error) {
      logger.error({ ...serializeError(error) }, "Failed to aggregate digest stats");
      throw error;
    }

    // Build unsubscribe URL using the first recipient as the canonical email
    const primaryEmail = activeRecipients[0];
    const unsubscribeUrl = this.buildUnsubscribeUrl(primaryEmail);

    const { subject, html, text } = renderDigestEmail(stats, {
      dashboardUrl: this.dashboardUrl,
      unsubscribeUrl,
    });

    logger.info(
      { date: stats.date, recipients: activeRecipients.length },
      "Sending daily digest email",
    );

    await this.sendEmail(
      { ...this.emailTransport, to: activeRecipients },
      subject,
      html,
      text,
    );

    logger.info(
      { date: stats.date, recipients: activeRecipients.length },
      "Daily digest sent successfully",
    );
  }

  async isUnsubscribed(email: string): Promise<boolean> {
    try {
      const record = await (prisma as any).digestUnsubscribe?.findUnique({
        where: { email },
      });
      return record !== null && record !== undefined;
    } catch {
      // Table may not exist in older deployments; treat as subscribed
      return false;
    }
  }

  async unsubscribe(email: string, token: string): Promise<boolean> {
    if (!this.verifyUnsubscribeToken(email, token)) {
      return false;
    }
    try {
      await (prisma as any).digestUnsubscribe?.upsert({
        where: { email },
        create: { email },
        update: {},
      });
    } catch (error) {
      logger.error({ ...serializeError(error), email }, "Failed to record unsubscribe");
      throw error;
    }
    return true;
  }

  private buildUnsubscribeUrl(email: string): string | undefined {
    if (!this.unsubscribeBaseUrl) return undefined;
    const token = this.buildUnsubscribeToken(email);
    const params = new URLSearchParams({ email, token });
    return `${this.unsubscribeBaseUrl.replace(/\/$/, "")}/admin/digest/unsubscribe?${params}`;
  }

  private async sendEmail(
    transport: DigestEmailTransport,
    subject: string,
    html: string,
    text: string,
  ): Promise<void> {
    if (transport.kind === "resend") {
      await this.sendViaResend(transport, subject, html, text);
    } else {
      await this.sendViaSmtp(transport, subject, html, text);
    }
  }

  private async sendViaResend(
    transport: ResendConfig,
    subject: string,
    html: string,
    text: string,
  ): Promise<void> {
    const response = await this.fetchImpl(transport.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${transport.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: transport.from,
        to: transport.to,
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend API error ${response.status}: ${body}`);
    }
  }

  private async sendViaSmtp(
    transport: SmtpConfig,
    subject: string,
    html: string,
    text: string,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require("nodemailer") as {
      createTransport: (opts: object) => {
        sendMail: (msg: object) => Promise<unknown>;
      };
    };

    const t = nodemailer.createTransport({
      host: transport.host,
      port: transport.port,
      secure: transport.secure,
      auth:
        transport.user && transport.pass
          ? { user: transport.user, pass: transport.pass }
          : undefined,
    });

    await t.sendMail({
      from: transport.from,
      to: transport.to.join(", "),
      subject,
      html,
      text,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Factory — resolves transport from env vars, mirroring alertService.ts
// ────────────────────────────────────────────────────────────────────────────

export function resolveDigestEmailTransport(
  env: NodeJS.ProcessEnv = process.env,
): DigestEmailTransport | undefined {
  const resendKey = env.RESEND_API_KEY?.trim();
  const resendFrom =
    env.RESEND_EMAIL_FROM?.trim() || env.FLUID_ALERT_EMAIL_FROM?.trim();
  const resendTo = (env.RESEND_EMAIL_TO || env.FLUID_ALERT_EMAIL_TO || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (resendKey && resendFrom && resendTo.length > 0) {
    return {
      kind: "resend",
      apiKey: resendKey,
      apiUrl: env.RESEND_API_URL?.trim() ?? DEFAULT_RESEND_API_URL,
      from: resendFrom,
      to: resendTo,
    };
  }

  const smtpHost = env.FLUID_ALERT_SMTP_HOST?.trim();
  const smtpFrom = env.FLUID_ALERT_EMAIL_FROM?.trim();
  const smtpTo = (env.FLUID_ALERT_EMAIL_TO || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (smtpHost && smtpFrom && smtpTo.length > 0) {
    return {
      kind: "smtp",
      host: smtpHost,
      port: parseInt(env.FLUID_ALERT_SMTP_PORT ?? "587", 10),
      secure: env.FLUID_ALERT_SMTP_SECURE === "true",
      user: env.FLUID_ALERT_SMTP_USER?.trim() || undefined,
      pass: env.FLUID_ALERT_SMTP_PASS?.trim() || undefined,
      from: smtpFrom,
      to: smtpTo,
    };
  }

  return undefined;
}
