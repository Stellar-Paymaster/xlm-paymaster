export type ServerLogLevel = "debug" | "info" | "warn" | "error";

export interface ServerLogEvent {
  id: string;
  level: ServerLogLevel;
  message: string;
  service: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export function formatSseEvent(event: string, data: unknown, id?: string): string {
  const lines = [`event: ${sanitizeSseField(event)}`];

  if (id) {
    lines.push(`id: ${sanitizeSseField(id)}`);
  }

  for (const line of (JSON.stringify(data) ?? "null").split(/\r?\n/)) {
    lines.push(`data: ${line}`);
  }

  return `${lines.join("\n")}\n\n`;
}

export function createServerLogEvent(
  input: Omit<ServerLogEvent, "id" | "timestamp"> & Partial<Pick<ServerLogEvent, "id" | "timestamp">>,
): ServerLogEvent {
  return {
    id: input.id ?? `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    level: input.level,
    message: input.message,
    metadata: input.metadata,
    service: input.service,
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}

export function parseServerLogEvent(value: string): ServerLogEvent | null {
  try {
    const parsed = JSON.parse(value) as Partial<ServerLogEvent>;

    if (
      typeof parsed.id !== "string" ||
      !isServerLogLevel(parsed.level) ||
      typeof parsed.message !== "string" ||
      typeof parsed.service !== "string" ||
      typeof parsed.timestamp !== "string"
    ) {
      return null;
    }

    return {
      id: parsed.id,
      level: parsed.level,
      message: parsed.message,
      metadata:
        parsed.metadata && typeof parsed.metadata === "object" && !Array.isArray(parsed.metadata)
          ? parsed.metadata
          : undefined,
      service: parsed.service,
      timestamp: parsed.timestamp,
    };
  } catch {
    return null;
  }
}

export function isServerLogLevel(value: unknown): value is ServerLogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error";
}

function sanitizeSseField(value: string): string {
  return value.replace(/[\r\n]/g, " ");
}
