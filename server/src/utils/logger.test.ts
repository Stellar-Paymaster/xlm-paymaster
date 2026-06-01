import { getDefaultLoggerOptions } from "./logger";
import pino from "pino";
import { PassThrough } from "stream";

test("logger emits SOC2 fields and redacts sensitive attributes", async () => {
  const stream = new PassThrough();
  let output = "";
  stream.on("data", (chunk) => {
    output += chunk.toString();
  });

  const testLogger = pino(getDefaultLoggerOptions(), stream);
  testLogger.info({ api_key: "abc123", secret: "p455w0rd" }, "auth_attempt");

  await new Promise<void>((resolve) => setImmediate(() => resolve()));

  const line = output.trim();
  expect(line).not.toHaveLength(0);

  const parsed = JSON.parse(line);
  expect(parsed).toHaveProperty("timestamp");
  expect(parsed).toHaveProperty("level");
  expect(parsed).toHaveProperty("event", "auth_attempt");
  expect(parsed).toHaveProperty("actor", "unknown");
  expect(parsed).toHaveProperty("ip", "unknown");
  expect(parsed).toHaveProperty("resource", "unknown");
  expect(parsed).toHaveProperty("outcome", "success");
  expect(parsed.api_key).toBe("[REDACTED]");
  expect(parsed.secret).toBe("[REDACTED]");
});