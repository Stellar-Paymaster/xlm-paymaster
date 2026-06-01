import { ConnectionOptions } from "bullmq";

function parseBullmqConnection(redisUrl: string): ConnectionOptions {
  try {
    const u = new URL(redisUrl);
    return {
      host: u.hostname || "127.0.0.1",
      port: u.port ? parseInt(u.port, 10) : 6379,
      ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
      ...(u.pathname.length > 1 ? { db: parseInt(u.pathname.slice(1), 10) } : {}),
      ...(u.protocol === "rediss:" ? { tls: {} } : {}),
    };
  } catch {
    return { host: "127.0.0.1", port: 6379 };
  }
}

// BullMQ requires its own connection — it cannot share the general-purpose ioredis
// client in utils/redis.ts because BullMQ puts connections into blocking-command mode.
export const bullmqConnection: ConnectionOptions = parseBullmqConnection(
  process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
);
