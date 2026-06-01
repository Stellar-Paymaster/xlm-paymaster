import { auth } from "@/auth";
import { buildOperatorSupportContext } from "@/lib/ai-support/context";
import {
  getAiSupportSettings,
  streamOperatorSupportAnswer,
} from "@/lib/ai-support/providers";
import {
  sanitizeChatMessages,
  type SupportChatMessage,
} from "@/lib/ai-support/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createSseEvent(event: string, payload: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { messages?: SupportChatMessage[] }
    | null;
  const messages = sanitizeChatMessages(body?.messages ?? []);

  if (messages.length === 0 || messages.at(-1)?.role !== "user") {
    return new Response("A user message is required", { status: 400 });
  }

  const settings = getAiSupportSettings();
  const context = await buildOperatorSupportContext({
    adminEmail: session.user.email,
    query: messages.at(-1)?.content ?? "",
    settings,
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(createSseEvent(event, payload)));
      };

      try {
        send("context", {
          provider: settings.provider,
          model: settings.model,
          docs: context.docs.map((chunk) => chunk.source),
          transactionCount: context.recentTransactions.length,
          healthStatus: context.nodeConfig.healthStatus,
        });

        let text = "";
        for await (const token of streamOperatorSupportAnswer({
          settings,
          messages,
          context,
        })) {
          text += token;
          send("token", { token });
        }

        send("done", { text: text.trim() });
      } catch (error: unknown) {
        send("error", {
          message:
            error instanceof Error ? error.message : "Failed to stream AI response",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}
