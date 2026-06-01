import { Request, Response, NextFunction } from "express";
import { createLogger } from "../utils/logger";
import { getIp } from "./soc2Logger";
import redis from "../utils/redis";

const logger = createLogger({ component: "admin_bruteforce" });

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SECONDS = 15 * 60; // 15 minutes

interface BruteForceEntry {
  count: number;
  lockedUntil: number;
}

export const memoryStore = new Map<string, BruteForceEntry>();

/**
 * Middleware to prevent brute-force and credential stuffing attacks on admin endpoints.
 * Enforces a progressive lockout when failed login thresholds are met, tracking by both IP and email.
 */
export async function adminBruteForceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const ip = getIp(req);
  const email = req.body?.email ? String(req.body.email).toLowerCase().trim() : "unknown";
  
  const ipKey = `bf:ip:${ip}`;
  const emailKey = `bf:email:${email}`;

  try {
    const ipLocked = await checkLockout(ipKey);
    const emailLocked = await checkLockout(emailKey);
    
    if (ipLocked || emailLocked) {
      res.status(429).json({
        error: "Too many failed login attempts. Please try again later.",
        code: "BRUTE_FORCE_LOCKOUT",
      });
      return;
    }
  } catch (error) {
    logger.warn({ error: String(error) }, "Failed to check brute force lockout state");
  }

  // Intercept the finish event to determine authentication outcome
  res.on("finish", () => {
    if (res.statusCode === 401 || res.statusCode === 403) {
      Promise.all([recordFailure(ipKey), recordFailure(emailKey)]).catch(() => {});
    } else if (res.statusCode >= 200 && res.statusCode < 300) {
      Promise.all([resetFailures(ipKey), resetFailures(emailKey)]).catch(() => {});
    }
  });

  next();
}

async function checkLockout(key: string): Promise<boolean> {
  try {
    const countStr = await redis.get(key);
    return Boolean(countStr && parseInt(countStr, 10) >= MAX_FAILED_ATTEMPTS);
  } catch {
    const entry = memoryStore.get(key);
    if (entry && entry.count >= MAX_FAILED_ATTEMPTS) {
      if (Date.now() < entry.lockedUntil) return true;
      memoryStore.delete(key);
    }
    return false;
  }
}

async function recordFailure(key: string): Promise<void> {
  try {
    const count = await redis.incr(key);
    if (count === 1 || count >= MAX_FAILED_ATTEMPTS) {
      await redis.expire(key, LOCKOUT_WINDOW_SECONDS);
    }
  } catch {
    const entry = memoryStore.get(key) ?? { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= MAX_FAILED_ATTEMPTS) {
      entry.lockedUntil = Date.now() + LOCKOUT_WINDOW_SECONDS * 1000;
    }
    memoryStore.set(key, entry);
  }
}

async function resetFailures(key: string): Promise<void> {
  try { await redis.del(key); } catch { memoryStore.delete(key); }
}