import { createLogger, serializeError } from "../utils/logger";

const logger = createLogger({ component: "slack_notifier" });

export type SlackAlertType =
  | "low_balance"
  | "server_error"
  | "server_lifecycle"
  | "failed_transaction"
  | "bridge_stall";

export interface SlackAlertToggles {
  lowBalance: boolean;
  serverError: boolean;
  serverLifecycle: boolean;
  failedTransaction: boolean;
  bridgeStall: boolean;
}

export interface SlackNotifierOptions {
  serviceName?: string;
  webhookUrl?: string;
  toggles?: Partial<SlackAlertToggles>;
}

export interface LowBalanceSlackPayload {
  accountPublicKey: string;
  balanceXlm: number;
  checkedAt: Date;
  horizonUrl?: string;
  networkPassphrase: string;
  thresholdXlm: number;
}

export interface ServerErrorSlackPayload {
  errorMessage: string;
  method?: string;
  path?: string;
  requestId?: string;
  statusCode: number;
  timestamp: Date;
}

export interface ServerLifecycleSlackPayload {
  detail: string;
  phase: "start" | "stop";
  timestamp: Date;
}

export interface FailedTransactionSlackPayload {
  detail: string;
  source: string;
  tenantId: string;
  timestamp: Date;
  transactionHash: string;
}

export interface BridgeStallSlackPayload {
  id: string;
  sourceChain: string;
  targetChain: string;
  sourceTxHash: string;
  amount: string;
  asset: string;
  stalledAt: Date;
}

interface SlackBlockText {
  type: "mrkdwn" | "plain_text";
  text: string;
  emoji?: boolean;
}

interface SlackBlock {
  type: "header" | "section" | "context";
  text?: SlackBlockText;
  fields?: SlackBlockText[];
  elements?: SlackBlockText[];
}

const defaultToggles: SlackAlertToggles = {
  failedTransaction: true,
  lowBalance: true,
  serverError: true,
  serverLifecycle: true,
  bridgeStall: true,
};

function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  return fallback;
}

export function loadSlackNotifierOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SlackNotifierOptions {
  return {
    serviceName: env.SLACK_ALERT_SERVICE_NAME?.trim() || "Fluid server",
    webhookUrl:
      env.SLACK_WEBHOOK_URL?.trim() ||
      env.FLUID_ALERT_SLACK_WEBHOOK_URL?.trim() ||
      undefined,
    toggles: {
      failedTransaction: parseBooleanEnv(
        env.SLACK_ALERT_FAILED_TRANSACTION_ENABLED,
        defaultToggles.failedTransaction,
      ),
      lowBalance: parseBooleanEnv(
        env.SLACK_ALERT_LOW_BALANCE_ENABLED,
        defaultToggles.lowBalance,
      ),
      serverError: parseBooleanEnv(
        env.SLACK_ALERT_5XX_ENABLED,
        defaultToggles.serverError,
      ),
      serverLifecycle: parseBooleanEnv(
        env.SLACK_ALERT_SERVER_LIFECYCLE_ENABLED,
        defaultToggles.serverLifecycle,
      ),
      bridgeStall: parseBooleanEnv(
        env.SLACK_ALERT_BRIDGE_STALL_ENABLED,
        defaultToggles.bridgeStall,
      ),
    },
  };
}

export interface SlackNotifierLike {
  isConfigured(): boolean;
  isEnabled(type: SlackAlertType): boolean;
  notifyFailedTransaction(
    payload: FailedTransactionSlackPayload,
  ): Promise<boolean>;
  notifyLowBalance(payload: LowBalanceSlackPayload): Promise<boolean>;
  notifyServerError(payload: ServerErrorSlackPayload): Promise<boolean>;
  notifyServerLifecycle(payload: ServerLifecycleSlackPayload): Promise<boolean>;
  notifyBridgeStall(payload: BridgeStallSlackPayload): Promise<boolean>;
}

export class SlackNotifier implements SlackNotifierLike {
  private readonly serviceName: string;
  private readonly toggles: SlackAlertToggles;
  private readonly webhookUrl?: string;

  constructor(
    options: SlackNotifierOptions = loadSlackNotifierOptionsFromEnv(),
  ) {
    this.serviceName = options.serviceName || "Fluid server";
    this.toggles = {
      ...defaultToggles,
      ...options.toggles,
    };
    this.webhookUrl = options.webhookUrl?.trim() || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.webhookUrl);
  }

  isEnabled(type: SlackAlertType): boolean {
    if (!this.isConfigured()) {
      return false;
    }

    switch (type) {
      case "failed_transaction":
        return this.toggles.failedTransaction;
      case "low_balance":
        return this.toggles.lowBalance;
      case "server_error":
        return this.toggles.serverError;
      case "server_lifecycle":
        return this.toggles.serverLifecycle;
      case "bridge_stall":
        return this.toggles.bridgeStall;
      default:
        return false;
    }
  }

  async notifyLowBalance(payload: LowBalanceSlackPayload): Promise<boolean> {
    return this.send(
      "low_balance",
      "⚠️",
      "Low balance alert",
      [
        `*Account*\n\`${payload.accountPublicKey}\``,
        `*Current balance*\n${payload.balanceXlm.toFixed(7)} XLM`,
        `*Threshold*\n${payload.thresholdXlm.toFixed(7)} XLM`,
        `*Network*\n${payload.networkPassphrase}`,
      ],
      [
        payload.horizonUrl ? `Horizon: ${payload.horizonUrl}` : undefined,
        "Top up the fee payer before sponsorship stops.",
      ],
      payload.checkedAt,
    );
  }

  async notifyServerError(payload: ServerErrorSlackPayload): Promise<boolean> {
    return this.send(
      "server_error",
      "🚨",
      "5xx server error",
      [
        `*Status*\n${payload.statusCode}`,
        `*Route*\n${payload.method || "UNKNOWN"} ${payload.path || "/"}`,
        `*Request ID*\n${payload.requestId || "n/a"}`,
        `*Service*\n${this.serviceName}`,
      ],
      [payload.errorMessage],
      payload.timestamp,
    );
  }

  async notifyServerLifecycle(
    payload: ServerLifecycleSlackPayload,
  ): Promise<boolean> {
    const emoji = payload.phase === "start" ? "🟢" : "🛑";
    const title =
      payload.phase === "start" ? "Server started" : "Server stopping";

    return this.send(
      "server_lifecycle",
      emoji,
      title,
      [`*Service*\n${this.serviceName}`, `*Phase*\n${payload.phase}`],
      [payload.detail],
      payload.timestamp,
    );
  }

  async notifyFailedTransaction(
    payload: FailedTransactionSlackPayload,
  ): Promise<boolean> {
    return this.send(
      "failed_transaction",
      "❌",
      "Failed transaction",
      [
        `*Transaction hash*\n\`${payload.transactionHash}\``,
        `*Tenant*\n${payload.tenantId}`,
        `*Source*\n${payload.source}`,
        `*Service*\n${this.serviceName}`,
      ],
      [payload.detail],
      payload.timestamp,
    );
  }

  async notifyBridgeStall(payload: BridgeStallSlackPayload): Promise<boolean> {
    return this.send(
      "bridge_stall",
      "⏳",
      "Bridge settlement stalled",
      [
        `*Settlement ID*\n\`${payload.id}\``,
        `*Route*\n${payload.sourceChain} ➔ ${payload.targetChain}`,
        `*Source Hash*\n\`${payload.sourceTxHash}\``,
        `*Amount*\n${payload.amount} ${payload.asset}`,
      ],
      [
        "This cross-chain settlement has exceeded its timeout window and requires manual intervention.",
      ],
      payload.stalledAt,
    );
  }

  private async send(
    type: SlackAlertType,
    emoji: string,
    title: string,
    fields: string[],
    details: Array<string | undefined>,
    timestamp: Date,
  ): Promise<boolean> {
    if (!this.isEnabled(type) || !this.webhookUrl) {
      return false;
    }

    const payload = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${emoji} ${title}`,
            emoji: true,
          },
        },
        {
          type: "section",
          fields: fields.map((field) => ({
            type: "mrkdwn",
            text: field,
          })),
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: details.filter(Boolean).join("\n"),
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `*Timestamp:* ${timestamp.toISOString()}`,
            },
          ],
        },
      ] satisfies SlackBlock[],
      text: `${emoji} ${title} | ${details.filter(Boolean).join(" | ")}`,
    };

    try {
      const response = await fetch(this.webhookUrl, {
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error(
          {
            event_type: type,
            response_body: body,
            response_status: response.status,
          },
          "Slack webhook request failed",
        );
        return false;
      }

      return true;
    } catch (error) {
      logger.error(
        {
          ...serializeError(error),
          event_type: type,
        },
        "Slack notification transport failed",
      );
      return false;
    }
  }
}
