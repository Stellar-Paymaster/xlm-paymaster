import { Job, Queue, Worker } from "bullmq";
import prisma from "../utils/db";
import { createLogger, serializeError } from "../utils/logger";
import { createRedisClient } from "../utils/redisClientFactory";

const logger = createLogger({ component: "audit_log" });
const connection = createRedisClient();

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

interface AuditSummaryJobData {
  auditLogId: string;
}

export const auditSummaryQueue = new Queue<AuditSummaryJobData>(
  "audit-summary",
  {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  },
);

// ---------------------------------------------------------------------------
// Create audit log entry + enqueue summary job
// ---------------------------------------------------------------------------

interface CreateAuditLogInput {
  actor: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

export async function createAuditLog(input: CreateAuditLogInput) {
  const entry = await prisma.auditLog.create({
    data: {
      actor: input.actor,
      action: input.action,
      target: input.target ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });

  await auditSummaryQueue.add("summarize", { auditLogId: entry.id });

  logger.debug({ audit_log_id: entry.id, action: input.action }, "Audit log created");
  return entry;
}

// ---------------------------------------------------------------------------
// AI summary generation (OpenAI or Ollama)
// ---------------------------------------------------------------------------

async function generateSummary(
  action: string,
  actor: string,
  target: string | null,
  metadata: string | null,
): Promise<string | null> {
  const prompt = [
    `Action: ${action}`,
    `Actor: ${actor}`,
    target ? `Target: ${target}` : null,
    metadata ? `Context: ${metadata}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Try Ollama first if configured
  const ollamaUrl = process.env.OLLAMA_URL?.trim();
  const ollamaModel = process.env.OLLAMA_MODEL?.trim() || "llama3";

  if (ollamaUrl) {
    try {
      const res = await fetch(`${ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: `Summarize this audit event in one short sentence (max 120 chars):\n${prompt}`,
          stream: false,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        const body = (await res.json()) as { response?: string };
        if (body.response) {
          return body.response.trim().slice(0, 200);
        }
      }
    } catch {
      logger.warn("Ollama summary generation failed, falling back to OpenAI");
    }
  }

  // Fall back to OpenAI
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const model = process.env.AUDIT_SUMMARY_MODEL?.trim() || "gpt-4.1-mini";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 60,
        messages: [
          {
            role: "system",
            content:
              "You summarize audit log events for a Stellar fee-sponsorship platform. Return a single sentence, max 120 characters. No quotes.",
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    return content ? content.slice(0, 200) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export function startAuditSummaryWorker() {
  const worker = new Worker<AuditSummaryJobData>(
    "audit-summary",
    async (job: Job<AuditSummaryJobData>) => {
      const { auditLogId } = job.data;
      const entry = await prisma.auditLog.findUnique({
        where: { id: auditLogId },
      });

      if (!entry) return;
      if (entry.aiSummary) return; // already summarized

      const summary = await generateSummary(
        entry.action,
        entry.actor,
        entry.target,
        entry.metadata,
      );

      if (summary) {
        await prisma.auditLog.update({
          where: { id: auditLogId },
          data: { aiSummary: summary },
        });
        logger.debug({ audit_log_id: auditLogId }, "AI summary saved");
      }
    },
    { connection, concurrency: 3 },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { ...serializeError(err), audit_log_id: job?.data.auditLogId },
      "Audit summary job failed",
    );
  });

  return worker;
}
