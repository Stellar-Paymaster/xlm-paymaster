import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IdempotencyService } from './idempotencyService';

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  beforeEach(() => {
    vi.useFakeTimers();
    // Short TTL (10s) and small max size (3) for easy testing
    service = new IdempotencyService(10000, 3);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return NEW for a fresh key', () => {
    const status = service.beginRequest('req-1');
    expect(status).toBe('NEW');
  });

  it('should return IN_PROGRESS for an active key without a finished response', () => {
    service.beginRequest('req-2');
    const status = service.beginRequest('req-2');
    expect(status).toBe('IN_PROGRESS');
  });

  it('should return COMPLETED and cache the response once finished', () => {
    service.beginRequest('req-3');
    service.finishRequest('req-3', { statusCode: 200, body: { success: true }, headers: {} });
    
    const status = service.beginRequest('req-3');
    expect(status).toBe('COMPLETED');

    const cached = service.getResponse('req-3');
    expect(cached).toEqual({ statusCode: 200, body: { success: true }, headers: {} });
  });

  it('should allow retries when a request fails', () => {
    service.beginRequest('req-4');
    service.failRequest('req-4'); // simulate error/rollback
    
    const retryStatus = service.beginRequest('req-4');
    expect(retryStatus).toBe('NEW');
  });

  it('should evict expired keys automatically', () => {
    service.beginRequest('req-5');
    service.finishRequest('req-5', { statusCode: 200, body: {}, headers: {} });

    // Advance time beyond the 10s TTL
    vi.advanceTimersByTime(11000);

    const status = service.beginRequest('req-5');
    expect(status).toBe('NEW'); // Re-processed because the cache expired
  });

  it('should enforce the LRU max size policy', () => {
    // Fill cache capacity
    service.beginRequest('req-A');
    service.beginRequest('req-B');
    service.beginRequest('req-C');

    // Ensure they are all IN_PROGRESS
    expect(service.beginRequest('req-A')).toBe('IN_PROGRESS');
    
    // Exceed capacity -> req-A (the oldest) should be evicted
    service.beginRequest('req-D');

    // req-A should now appear as NEW again
    expect(service.beginRequest('req-A')).toBe('NEW');
    // req-B should have been evicted to fit req-A
    expect(service.beginRequest('req-B')).toBe('NEW');
    // req-C and req-D should still be tracked
    expect(service.beginRequest('req-C')).toBe('IN_PROGRESS');
    expect(service.beginRequest('req-D')).toBe('IN_PROGRESS');
  });
});