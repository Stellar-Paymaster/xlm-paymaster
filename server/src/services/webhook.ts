import { createHmac } from "node:crypto";
import { Job, Queue, Worker } from "bullmq";
import { createLogger, serializeError } from "../utils/logger";

import axios from "axios";
import prisma from "../utils/db";
import {
  deserializeWebhookEventTypes,
  mapTransactionStatusToWebhookEventType,
  type WebhookEventType,
} from "./webhookEventTypes";
import { createRedisClient } from "../utils/redisClientFactory";
import {
  calculateWebhookNextAttempt,
  WEBHOOK_RETRY_CONFIG,
} from "./webhookBackoff";
const connection = createRedisClient();
export const webhookLogger = createLogger({ component: "webhook_service" });

export const webhookQueue = new Queue("webhook-delivery", {
  connection,
  defaultJobOptions: {
    attempts: WEBHOOK_RETRY_CONFIG.attempts,
    backoff: {
      type: WEBHOOK_RETRY_CONFIG.backoffType,
      delay: WEBHOOK_RETRY_CONFIG.baseDelayMs,
    },
    removeOnComplete: true,
  },
});

interface WebhookJobData {
  deliveryId: string;
}

type WebhookStatus = "success" | "failed";

interface WebhookPayload {
  eventType: WebhookEventType;
  hash: string;
  status: WebhookStatus;
}

const WEBHOOK_SIGNATURE_HEADER = "X-Fluid-Signature-256";
const WEBHOOK_SIGNATURE_PREFIX = "sha256=";
const MAX_RETRY_ATTEMPTS = WEBHOOK_RETRY_CONFIG.maxAttempts;
const DLQ_EXPIRY_DAYS = parseInt(process.env.WEBHOOK_DLQ_EXPIRY_DAYS || "30", 10);

export function serializeWebhookPayload(payload: string | WebhookPayload): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

export function signWebhookPayload(secret: string, body: string): string {
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return `${WEBHOOK_SIGNATURE_PREFIX}${digest}`;
}

function buildSignedWebhookRequest(
  secret: string,
  payload: string | WebhookPayload,
  extraHeaders: Record<string, string> = {}
): { body: string; headers: Record<string, string> } {
  const body = serializeWebhookPayload(payload);

  return {
    body,
    headers: {
      "Content-Type": "application/json",
      [WEBHOOK_SIGNATURE_HEADER]: signWebhookPayload(secret, body),
      ...extraHeaders,
    },
  };
}

export class WebhookService {
  static async queueWebhook (tenantId: string, url: string, payload: any) {
    const delivery = await prisma.webhookDelivery.create({
      data: {
        tenantId,
        url,
        payload: serializeWebhookPayload(payload),
        status: "pending",
      },
    });

    await webhookQueue.add("deliver", {
      deliveryId: delivery.id,
    });

    return delivery;
  }

  async dispatch (
    tenantId: string,
    hash: string,
    status: WebhookStatus
  ): Promise<void> {
    const eventType = mapTransactionStatusToWebhookEventType(status);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        webhookEventTypes: true,
        webhookSecret: true,
        webhookUrl: true,
      },
    });

    if (!tenant) {
      webhookLogger.warn(
        { tenant_id: tenantId, tx_hash: hash, status },
        "Tenant not found for webhook dispatch"
      );
      return;
    }

    if (!tenant.webhookUrl) {
      webhookLogger.debug(
        { tenant_id: tenant.id, tx_hash: hash, status },
        "Tenant has no webhook URL configured"
      );
      return;
    }

    const enabledEventTypes = deserializeWebhookEventTypes(tenant.webhookEventTypes);
    if (!enabledEventTypes.includes(eventType)) {
      webhookLogger.debug(
        {
          enabled_event_types: enabledEventTypes,
          event_type: eventType,
          tenant_id: tenant.id,
          tx_hash: hash,
        },
        "Webhook event filtered out for tenant"
      );
      return;
    }

    if (!tenant.webhookSecret) {
      webhookLogger.error(
        {
          event_type: eventType,
          status,
          tenant_id: tenant.id,
          tx_hash: hash,
          webhook_url: tenant.webhookUrl,
        },
        "Tenant has no webhook secret configured; refusing unsigned webhook dispatch"
      );
      return;
    }

    const request = buildSignedWebhookRequest(tenant.webhookSecret, {
      eventType,
      hash,
      status,
    });

    try {
      const response = await fetch(tenant.webhookUrl, {
        method: "POST",
        headers: request.headers,
        body: request.body,
      });

      if (!response.ok) {
        webhookLogger.error(
          {
            response_status: response.status,
            status,
            tenant_id: tenant.id,
            tx_hash: hash,
            webhook_url: tenant.webhookUrl,
          },
          "Webhook dispatch returned non-2xx response"
        );
        return;
      }

      webhookLogger.info(
        { status, tenant_id: tenant.id, tx_hash: hash, webhook_url: tenant.webhookUrl },
        "Webhook dispatched successfully"
      );
    } catch (error) {
      webhookLogger.error(
        {
          ...serializeError(error),
          status,
          tenant_id: tenant.id,
          tx_hash: hash,
          webhook_url: tenant.webhookUrl,
        },
        "Network error during webhook dispatch"
      );
    }
  }
}

// Worker logic
export const startWebhookWorker = () => {
  const worker = new Worker<WebhookJobData>(
    "webhook-delivery",
    async (job: Job<WebhookJobData>) => {
      const { deliveryId } = job.data;
      const delivery = await prisma.webhookDelivery.findUnique({
        where: { id: deliveryId },
        include: {
          tenant: {
            select: {
              webhookSecret: true,
            },
          },
        },
      });

      if (!delivery) return;

      if (!delivery.tenant?.webhookSecret) {
        const lastError = "Webhook secret not configured for tenant";

        webhookLogger.error(
          {
            delivery_id: deliveryId,
            tenant_id: delivery.tenantId,
            url: delivery.url,
          },
          "Webhook delivery skipped because tenant webhook signing is not configured"
        );

        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            lastError,
            retryCount: job.attemptsMade,
            status: "failed",
          },
        });
        return;
      }

      try {
        webhookLogger.info(
          {
            attempt: job.attemptsMade + 1,
            delivery_id: deliveryId,
            tenant_id: delivery.tenantId,
            url: delivery.url,
          },
          "Attempting webhook delivery"
        );

        const request = buildSignedWebhookRequest(
          delivery.tenant.webhookSecret,
          delivery.payload,
          {
            "X-Webhook-ID": deliveryId,
          }
        );

        await axios.post(delivery.url, request.body, {
          timeout: 5000,
          headers: request.headers,
        });

        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: "success",
            retryCount: job.attemptsMade,
          },
        });

        webhookLogger.info(
          { delivery_id: deliveryId, tenant_id: delivery.tenantId, url: delivery.url },
          "Webhook delivery succeeded"
        );
      } catch (error: any) {
        const errorMessage = error.response?.data || error.message;
        webhookLogger.error(
          {
            ...serializeError(error),
            attempt: job.attemptsMade + 1,
            delivery_id: deliveryId,
            tenant_id: delivery.tenantId,
            url: delivery.url,
            webhook_error: errorMessage,
          },
          "Webhook delivery failed"
        );

        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: "failed",
            retryCount: job.attemptsMade + 1,
            lastError: errorMessage.toString().substring(0, 500),
            nextAttempt: calculateWebhookNextAttempt({
              baseDelayMs: (job.opts.backoff as { delay?: number })?.delay,
              attemptsMade: job.attemptsMade,
            }),
          },
        });

        throw error; // Let BullMQ handle the retry
      }
    },
    { connection }
  );

  worker.on("failed", async (job: Job<WebhookJobData> | undefined, err: Error) => {
    if (job && job.attemptsMade >= MAX_RETRY_ATTEMPTS) {
      const { deliveryId } = job.data;

      webhookLogger.error(
        {
          ...serializeError(err),
          attempts: job.attemptsMade,
          delivery_id: deliveryId,
          job_id: job.id,
        },
        "Webhook delivery failed permanently, moving to DLQ"
      );

      try {
        const delivery = await prisma.webhookDelivery.findUnique({
          where: { id: deliveryId },
        });

        if (delivery) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + DLQ_EXPIRY_DAYS);

          await prisma.webhookDlq.create({
            data: {
              tenantId: delivery.tenantId,
              deliveryId: delivery.id,
              url: delivery.url,
              payload: delivery.payload,
              lastError: delivery.lastError,
              retryCount: delivery.retryCount,
              expiresAt,
            },
          });

          webhookLogger.info(
            { delivery_id: deliveryId, tenant_id: delivery.tenantId },
            "Failed webhook delivery moved to DLQ"
          );
        }
      } catch (dlqError) {
        webhookLogger.error(
          { ...serializeError(dlqError), delivery_id: deliveryId },
          "Failed to move webhook delivery to DLQ"
        );
      }
    }
  });

  return worker;
};
