"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import { Bot, LoaderCircle, MessageSquare, Send, Sparkles, X } from "lucide-react";

interface WidgetMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ParsedSseEvent {
  event: string;
  data: string;
}

const STARTER_PROMPTS = [
  "Why are any recent transactions failing?",
  "Summarize the current node configuration.",
  "What patterns do you see in the latest transaction activity?",
];

const INITIAL_MESSAGE: WidgetMessage = {
  id: "assistant-welcome",
  role: "assistant",
  content:
    "I can answer questions about the current node state, the latest 100 transactions, and Fluid docs.",
};

function parseSseBlock(block: string): ParsedSseEvent | null {
  const lines = block.split("\n");
  const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!event || !data) {
    return null;
  }

  return { event, data };
}

function buildStorageKey(email: string | undefined) {
  return `fluid-ai-support:${email ?? "anonymous"}`;
}

export function AiSupportWidget() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<WidgetMessage[]>([INITIAL_MESSAGE]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextNote, setContextNote] = useState(
    "Context includes selected docs, node config, and up to 100 recent transactions.",
  );

  const storageKey = useMemo(
    () => buildStorageKey(session?.user?.email),
    [session?.user?.email],
  );
  const visible = pathname.startsWith("/admin");

  useEffect(() => {
    if (!visible) {
      return;
    }

    const saved = sessionStorage.getItem(storageKey);
    if (!saved) {
      setMessages([INITIAL_MESSAGE]);
      return;
    }

    try {
      const parsed = JSON.parse(saved) as WidgetMessage[];
      setMessages(parsed.length > 0 ? parsed : [INITIAL_MESSAGE]);
    } catch {
      setMessages([INITIAL_MESSAGE]);
    }
  }, [storageKey, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    sessionStorage.setItem(storageKey, JSON.stringify(messages));
  }, [messages, storageKey, visible]);

  if (!visible) {
    return null;
  }

  async function submitQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) {
      return;
    }

    setOpen(true);
    setError(null);
    setLoading(true);
    setInput("");

    const timestamp = Date.now();
    const userMessage: WidgetMessage = {
      id: `user-${timestamp}`,
      role: "user",
      content: trimmed,
    };
    const assistantMessageId = `assistant-${timestamp}`;

    const nextMessages = [
      ...messages,
      userMessage,
      { id: assistantMessageId, role: "assistant" as const, content: "" },
    ];
    setMessages(nextMessages);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.content.trim().length > 0)
            .map((message) => ({
              role: message.role,
              content: message.content,
            })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Chat request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

        while (buffer.includes("\n\n")) {
          const boundary = buffer.indexOf("\n\n");
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          const parsed = parseSseBlock(rawEvent);
          if (!parsed) {
            continue;
          }

          const payload = JSON.parse(parsed.data) as {
            token?: string;
            text?: string;
            docs?: string[];
            transactionCount?: number;
            healthStatus?: string | null;
            message?: string;
            provider?: string;
            model?: string;
          };

          if (parsed.event === "context") {
            const docsLabel = payload.docs?.length ? payload.docs.join(", ") : "docs unavailable";
            const healthLabel = payload.healthStatus ?? "health unavailable";
            setContextNote(
              `${payload.provider}/${payload.model} with ${payload.transactionCount ?? 0} recent txs, ${healthLabel}, docs: ${docsLabel}.`,
            );
          }

          if (parsed.event === "token") {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: `${message.content}${payload.token ?? ""}` }
                  : message,
              ),
            );
          }

          if (parsed.event === "done" && payload.text) {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: payload.text ?? message.content }
                  : message,
              ),
            );
          }

          if (parsed.event === "error") {
            throw new Error(payload.message ?? "Failed to generate chat response");
          }
        }
      }
    } catch (submitError: unknown) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Failed to reach the dashboard assistant";
      setError(message);
      setMessages((current) =>
        current.map((entry) =>
          entry.id === assistantMessageId
            ? {
                ...entry,
                content:
                  "I couldn't complete that request. Check the AI provider configuration and try again.",
              }
            : entry,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuestion(input);
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open ? (
        <div className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.22),_transparent_52%),linear-gradient(135deg,#0f172a,#1e293b)] px-5 py-4 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-sky-200">
                  <Sparkles className="h-4 w-4" />
                  Operator Copilot
                </div>
                <h2 className="mt-2 text-lg font-semibold">Dashboard AI Support</h2>
                <p className="mt-1 text-sm text-slate-200">{contextNote}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-white/20 bg-white/10 p-2 transition hover:bg-white/20"
                aria-label="Close support assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[26rem] space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-10 rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-sm text-white"
                    : "mr-10 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm"
                }
              >
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  {message.role === "assistant" ? <Bot className="h-3.5 w-3.5" /> : null}
                  {message.role}
                </div>
                {message.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-1">
                    <ReactMarkdown>{message.content || "Thinking..."}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
              </div>
            ))}
            {loading ? (
              <div className="flex items-center gap-2 px-2 text-sm text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Streaming response...
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-200 bg-white px-4 py-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={loading}
                  onClick={() => void submitQuestion(prompt)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form onSubmit={onSubmit} className="space-y-2">
              <label htmlFor="ai-support-input" className="sr-only">
                Ask the dashboard assistant
              </label>
              <textarea
                id="ai-support-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about node health, config, or transaction history..."
                className="min-h-24 w-full rounded-2xl border border-slate-300 px-3 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  History is persisted in this admin browser session.
                </p>
                <button
                  type="submit"
                  disabled={loading || input.trim().length < 4}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Send className="h-4 w-4" />
                  Ask
                </button>
              </div>
            </form>

            {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-3 rounded-full bg-[linear-gradient(135deg,#0f172a,#0369a1)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(3,105,161,0.32)] transition hover:translate-y-[-1px]"
      >
        <MessageSquare className="h-4 w-4" />
        AI Support
      </button>
    </div>
  );
}
