/**
 * Pure GCRA (Generic Cell Rate Algorithm) leaky-bucket implementation.
 * Shared by Redis Lua script, in-memory fallback, and boundary tests.
 */

export interface GcraConfig {
  capacity: number;
  windowMs: number;
}

export interface GcraState {
  tat: number;
}

export interface GcraResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  resetMs: number;
}

/**
 * Consume one token from a GCRA leaky bucket.
 * Mutates `state.tat` when the request is allowed.
 */
export function consumeGcraBucket(
  state: GcraState,
  config: GcraConfig,
  now: number,
): GcraResult {
  const { capacity, windowMs } = config;
  const emissionInterval = windowMs / capacity;

  const tat = Math.max(state.tat, now);
  const newTat = tat + emissionInterval;

  if (newTat - now > windowMs) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.ceil(newTat - now - windowMs),
      resetMs: Math.ceil(tat - now),
    };
  }

  state.tat = newTat;
  return {
    allowed: true,
    remaining: Math.floor((windowMs - (newTat - now)) / emissionInterval),
    retryAfterMs: 0,
    resetMs: Math.ceil(newTat - now),
  };
}

/**
 * Fixed-window counter used by IP and sandbox rate limiters (INCR + EXPIRE).
 */
export interface FixedWindowState {
  count: number;
  windowStartMs: number;
}

export interface FixedWindowResult {
  allowed: boolean;
  count: number;
  remaining: number;
  ttlMs: number;
}

export function consumeFixedWindow(
  state: FixedWindowState,
  limit: number,
  windowMs: number,
  now: number,
): FixedWindowResult {
  if (now >= state.windowStartMs + windowMs) {
    state.count = 1;
    state.windowStartMs = now;
    return {
      allowed: true,
      count: 1,
      remaining: limit - 1,
      ttlMs: windowMs,
    };
  }

  state.count += 1;
  const ttlMs = state.windowStartMs + windowMs - now;
  return {
    allowed: state.count <= limit,
    count: state.count,
    remaining: Math.max(limit - state.count, 0),
    ttlMs,
  };
}
