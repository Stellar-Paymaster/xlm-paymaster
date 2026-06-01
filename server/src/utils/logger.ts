import pino, { type Bindings, type Logger, type LoggerOptions } from "pino";

type SerializableError = {
    type?: string;
    message: string;
    stack?: string;
    code?: unknown;
    status?: unknown;
    status_code?: unknown;
    response_status?: unknown;
    response_data?: unknown;
};

const defaultLevel = process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "production" ? "info" : "debug");
const prettyLoggingEnabled =
    process.env.NODE_ENV !== "production" && process.env.LOG_PRETTY === "true";

const loggerOptions: LoggerOptions = {
    level: defaultLevel,
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    base: {
        service: "fluid-server",
        env: process.env.NODE_ENV ?? "development",
    },
    messageKey: "event",
    formatters: {
        level: (level) => ({ level }),
        log: (log) => {
            const defaultOutcome = log.level === "error" || log.level === "fatal" ? "failure" : "success";
            return {
                actor: typeof log.actor === "string" && log.actor.length > 0 ? log.actor : "unknown",
                ip: typeof log.ip === "string" && log.ip.length > 0 ? log.ip : "unknown",
                resource: typeof log.resource === "string" && log.resource.length > 0 ? log.resource : "unknown",
                outcome: typeof log.outcome === "string" && log.outcome.length > 0 ? log.outcome : defaultOutcome,
                ...log,
            };
        },
    },
    redact: {
        paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.headers['x-api-key']",
            "req.headers['x-admin-token']",
            "req.body.token",
            "req.body.secret",
            "req.body.password",
            "req.body.api_key",
            "**.password",
            "**.secret",
            "**.token",
            "**.api_key",
            "**.access_key",
            "error.response_data",
            "error.response_status",
        ],
        censor: "[REDACTED]",
    },
};

const transport = prettyLoggingEnabled
    ? pino.transport({
        target: "pino-pretty",
        options: {
            colorize: true,
            singleLine: false,
            translateTime: "SYS:standard",
        },
    })
    : undefined;

export const logger = pino(loggerOptions, transport);

export function getDefaultLoggerOptions(): LoggerOptions {
    return loggerOptions;
}

export function createLogger (bindings: Bindings): Logger {
    return logger.child(bindings);
}

export function serializeError (error: unknown): SerializableError {
    if (error instanceof Error) {
        const candidate = error as Error & {
            cause?: unknown;
            code?: unknown;
            response?: { data?: unknown; status?: unknown };
            status?: unknown;
            statusCode?: unknown;
        };

        return {
            type: error.name,
            message: error.message,
            stack: error.stack,
            code: candidate.code,
            status: candidate.status,
            status_code: candidate.statusCode,
            response_status: candidate.response?.status,
            response_data: candidate.response?.data,
        };
    }

    return {
        message: String(error),
    };
}