import "server-only";

import type { SupportContext } from "@/lib/ai-support/context";
import type { SupportChatMessage } from "@/lib/ai-support/shared";

export interface AiSupportSettings {
  model: string;
  provider: string;
}

export function getAiSupportSettings(): AiSupportSettings {
  return {
    provider: process.env.AI_SUPPORT_PROVIDER?.trim() || "local-fallback",
    model: process.env.AI_SUPPORT_MODEL?.trim() || "deterministic-ops-assistant",
  };
}

function buildSummary(
  context: SupportContext,
  messages: SupportChatMessage[],
) {
  const latestQuestion = messages.at(-1)?.content ?? context.query;
  const recentTransactions = context.recentTransactions
    .map(
      (transaction) =>
        `${transaction.timestamp}: ${transaction.status} ${transaction.category} for ${transaction.tenant}`,
    )
    .join("; ");
  const docs = context.docs.map((doc) => `${doc.source}: ${doc.excerpt}`).join(" ");

  return [
    `Operator summary for "${latestQuestion}":`,
    `Node health is ${context.nodeConfig.healthStatus ?? "unknown"} using ${context.nodeConfig.source} data.`,
    `Recent transactions reviewed: ${context.recentTransactions.length}. ${recentTransactions || "No recent transactions available."}`,
    `Reference guidance: ${docs}`,
    "This response is running in local fallback mode, so treat it as a dashboard summary rather than a model-generated recommendation.",
  ].join("\n\n");
}

export async function* streamOperatorSupportAnswer(input: {
  context: SupportContext;
  messages: SupportChatMessage[];
  settings: AiSupportSettings;
}): AsyncGenerator<string> {
  const response = buildSummary(input.context, input.messages);

  for (const chunk of response.match(/.{1,80}(\s|$)/g) ?? [response]) {
    yield chunk;
  }
}
