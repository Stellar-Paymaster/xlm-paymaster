import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { idempotencyMiddleware, globalIdempotencyService } from './idempotencyMiddleware';

describe('idempotencyMiddleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      method: 'POST',
      headers: {},
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
      setHeader: vi.fn(),
      getHeaders: vi.fn().mockReturnValue({ 'content-type': 'application/json' }),
      statusCode: 200,
    };

    next = vi.fn();

    // Reset the global instance state between tests
    // Since max size and TTL are private, we can clear it by mocking an empty map
    (globalIdempotencyService as any).cache.clear();
  });

  it('should call next() immediately for GET requests', () => {
    req.method = 'GET';
    req.headers = { 'idempotency-key': 'abc' };

    idempotencyMiddleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should call next() if no idempotency key is provided', () => {
    idempotencyMiddleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should intercept response and cache it for a new idempotency key', () => {
    req.headers = { 'idempotency-key': 'key-1' };
    
    idempotencyMiddleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Simulate successful controller response
    res.statusCode = 201;
    (res.send as any)({ id: 123 });

    // Verify it was cached
    const cached = globalIdempotencyService.getResponse('global:key-1');
    expect(cached).toBeDefined();
    expect(cached?.statusCode).toBe(201);
    expect(cached?.body).toEqual({ id: 123 });
  });

  it('should return 409 Conflict if the request is IN_PROGRESS', () => {
    req.headers = { 'x-request-id': 'key-2' };
    
    // First request
    idempotencyMiddleware(req as Request, res as Response, next);
    
    // Concurrent second request
    idempotencyMiddleware(req as Request, res as Response, next);
    
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Conflict: Request is already processing.' });
  });

  it('should return cached response if COMPLETED', () => {
    req.headers = { 'idempotency-key': 'key-3' };
    
    // First pass completes
    idempotencyMiddleware(req as Request, res as Response, next);
    (res.send as any)({ result: 'success' });

    // Reset mocks
    vi.clearAllMocks();

    // Retry identically
    idempotencyMiddleware(req as Request, res as Response, next);
    
    // Assert cache hit instead of passing to controller
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({ result: 'success' });
  });
});