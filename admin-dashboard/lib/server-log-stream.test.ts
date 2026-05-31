import assert from "node:assert/strict";
import test from "node:test";
import {
  createServerLogEvent,
  formatSseEvent,
  isServerLogLevel,
  parseServerLogEvent,
} from "./server-log-stream.ts";

test("formatSseEvent emits named SSE events with optional ids", () => {
  const event = formatSseEvent("log", { message: "ready" }, "log_1");

  assert.equal(event, 'event: log\nid: log_1\ndata: {"message":"ready"}\n\n');
});

test("formatSseEvent sanitizes event and id fields", () => {
  const event = formatSseEvent("log\nretry: 1", undefined, "log_1\rdata: injected");

  assert.equal(event, "event: log retry: 1\nid: log_1 data: injected\ndata: null\n\n");
});

test("createServerLogEvent fills id and timestamp defaults", () => {
  const event = createServerLogEvent({
    level: "info",
    message: "stream connected",
    service: "admin-dashboard",
  });

  assert.match(event.id, /^log_/);
  assert.equal(event.level, "info");
  assert.equal(event.message, "stream connected");
  assert.equal(event.service, "admin-dashboard");
  assert.doesNotThrow(() => new Date(event.timestamp).toISOString());
});

test("parseServerLogEvent accepts valid events", () => {
  const parsed = parseServerLogEvent(
    JSON.stringify({
      id: "log_1",
      level: "warn",
      message: "upstream unavailable",
      metadata: { retry: true },
      service: "admin-dashboard",
      timestamp: "2026-05-31T12:00:00.000Z",
    }),
  );

  assert.deepEqual(parsed, {
    id: "log_1",
    level: "warn",
    message: "upstream unavailable",
    metadata: { retry: true },
    service: "admin-dashboard",
    timestamp: "2026-05-31T12:00:00.000Z",
  });
});

test("parseServerLogEvent rejects malformed and unknown-level payloads", () => {
  assert.equal(parseServerLogEvent("{"), null);
  assert.equal(
    parseServerLogEvent(
      JSON.stringify({
        id: "log_1",
        level: "fatal",
        message: "bad level",
        service: "server",
        timestamp: "2026-05-31T12:00:00.000Z",
      }),
    ),
    null,
  );
});

test("isServerLogLevel recognizes supported log levels", () => {
  assert.equal(isServerLogLevel("debug"), true);
  assert.equal(isServerLogLevel("info"), true);
  assert.equal(isServerLogLevel("warn"), true);
  assert.equal(isServerLogLevel("error"), true);
  assert.equal(isServerLogLevel("trace"), false);
});
