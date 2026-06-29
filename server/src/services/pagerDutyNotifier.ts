import { createLogger, serializeError } from "../utils/logger";

const logger = createLogger({ component: "pagerduty_notifier" });

export type PagerDutyEventType =
  | "signer_pool_empty"
  | "horizon_unreachable"
  | "server_restart"
  | "rate_limit_surge"
  | "database_failure";

export interface PagerDutyNotifierOptions {
  routingKey?: string;
  serviceName?: string;
  source?: string;
  component?: string;
}

export interface PagerDutyEventDetails {
  summary: string;
  severity?: "critical" | "error" | "warning" | "info";
  timestamp?: Date;
  customDetails?: Record<string, unknown>;
}

export function loadPagerDutyNotifierOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PagerDutyNotifierOptions {
  return {
    routingKey: env.PAGERDUTY_ROUTING_KEY?.trim(),
    serviceName: env.PAGERDUTY_SERVICE_NAME?.trim() || "XLM Paymaster server",
    source: env.PAGERDUTY_SOURCE?.trim() || "paymaster-server",
    component: env.PAGERDUTY_COMPONENT?.trim() || "fee-sponsorship",
  };
}

export class PagerDutyNotifier {
  private readonly routingKey?: string;
  private readonly serviceName: string;
  private readonly source: string;
  private readonly component: string;

  constructor(
    options: PagerDutyNotifierOptions = loadPagerDutyNotifierOptionsFromEnv(),
  ) {
    this.routingKey = options.routingKey?.trim() || undefined;
    this.serviceName = options.serviceName || "XLM Paymaster server";
    this.source = options.source || "paymaster-server";
    this.component = options.component || "fee-sponsorship";
  }

  isConfigured(): boolean {
    return Boolean(this.routingKey);
  }

  async trigger(
    type: PagerDutyEventType,
    details: PagerDutyEventDetails,
  ): Promise<boolean> {
    return this.sendEvent("trigger", type, details);
  }

  async triggerCritical(
    type: PagerDutyEventType,
    summary: string,
    customDetails?: Record<string, unknown>,
  ): Promise<boolean> {
    return this.trigger(type, {
      summary,
      severity: "critical",
      customDetails: { ...customDetails, critical_alert: true },
    });
  }

  async resolve(
    type: PagerDutyEventType,
    details: PagerDutyEventDetails,
  ): Promise<boolean> {
    return this.sendEvent("resolve", type, details);
  }

  private buildDedupKey(type: PagerDutyEventType): string {
    return `paymaster:${type}`;
  }

  private async sendEvent(
    action: "trigger" | "resolve",
    type: PagerDutyEventType,
    details: PagerDutyEventDetails,
  ): Promise<boolean> {
    if (!this.routingKey) {
      return false;
    }

    const timestamp = (details.timestamp ?? new Date()).toISOString();
    const payload = {
      routing_key: this.routingKey,
      event_action: action,
      dedup_key: this.buildDedupKey(type),
      payload: {
        summary: details.summary,
        source: this.source,
        severity: details.severity ?? "critical",
        component: this.component,
        group: this.serviceName,
        class: type,
        timestamp,
        custom_details: {
          service: this.serviceName,
          event_type: type,
          ...(details.customDetails ?? {}),
        },
      },
    };

    try {
      const response = await fetch("https://events.pagerduty.com/v2/enqueue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error(
          {
            event_action: action,
            event_type: type,
            response_status: response.status,
            response_body: body,
          },
          "PagerDuty event request failed",
        );
        return false;
      }

      logger.info(
        { event_action: action, event_type: type },
        "PagerDuty event delivered",
      );
      return true;
    } catch (error) {
      logger.error(
        { ...serializeError(error), event_action: action, event_type: type },
        "PagerDuty event transport failed",
      );
      return false;
    }
  }
}
