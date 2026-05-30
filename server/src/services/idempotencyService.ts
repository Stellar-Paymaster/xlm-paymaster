export interface CachedResponse {
  statusCode: number;
  body: any;
  headers: Record<string, any>;
}

export interface IdempotencyEntry {
  status: 'IN_PROGRESS' | 'COMPLETED';
  response?: CachedResponse;
  expiresAt: number;
}

/**
 * In-memory idempotency store with an LRU-style eviction policy.
 * Prevents double-processing and caches successful responses for retries.
 */
export class IdempotencyService {
  private cache: Map<string, IdempotencyEntry>;
  private ttlMs: number;
  private maxSize: number;

  constructor(ttlMs: number = 86400000, maxSize: number = 10000) {
    // Default: 24 hours TTL, maximum 10,000 tracked keys
    this.cache = new Map();
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  public beginRequest(key: string): 'NEW' | 'IN_PROGRESS' | 'COMPLETED' {
    const now = Date.now();
    const entry = this.cache.get(key);

    if (entry) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
      } else {
        return entry.status;
      }
    }

    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, { status: 'IN_PROGRESS', expiresAt: now + this.ttlMs });
    return 'NEW';
  }

  public getResponse(key: string): CachedResponse | null {
    const entry = this.cache.get(key);
    if (entry && entry.status === 'COMPLETED' && entry.response) {
      return entry.response;
    }
    return null;
  }

  public finishRequest(key: string, response: CachedResponse): void {
    if (this.cache.has(key)) {
      this.cache.set(key, { status: 'COMPLETED', response, expiresAt: Date.now() + this.ttlMs });
    }
  }

  public failRequest(key: string): void {
    this.cache.delete(key); // Allow subsequent retries to attempt the request again
  }

  private evictOldest(): void {
    const now = Date.now();
    for (const [k, v] of this.cache.entries()) {
      if (v.expiresAt < now) this.cache.delete(k);
    }
    // If still at/over capacity, delete the oldest item (Map iterates in insertion order)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
  }
}