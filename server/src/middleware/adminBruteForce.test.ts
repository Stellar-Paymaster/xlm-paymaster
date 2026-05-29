import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { adminBruteForceMiddleware, memoryStore } from './adminBruteForce';
import redis from '../utils/redis';

vi.mock('../utils/redis', () => ({
  default: {
    get: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('./soc2Logger', () => ({
  getIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('adminBruteForceMiddleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    memoryStore.clear();
    req = { body: { email: 'admin@example.com' } };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      statusCode: 200,
      on: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  it('should allow request if under limit via Redis', async () => {
    vi.mocked(redis.get).mockResolvedValue(null);
    await adminBruteForceMiddleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(429);
  });

  it('should block request if IP is over limit via Redis', async () => {
    vi.mocked(redis.get).mockImplementation(async (key: string) => {
      if (key === 'bf:ip:127.0.0.1') return '5';
      return null;
    });
    await adminBruteForceMiddleware(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'BRUTE_FORCE_LOCKOUT' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should record failure on 401 Unauthorized and fallback to memoryStore if Redis fails', async () => {
    vi.mocked(redis.get).mockRejectedValue(new Error('Redis down'));
    vi.mocked(redis.incr).mockRejectedValue(new Error('Redis down'));

    let finishCallback: () => void = () => {};
    res.on = vi.fn().mockImplementation((event, cb) => {
      if (event === 'finish') finishCallback = cb;
      return res;
    });

    await adminBruteForceMiddleware(req as Request, res as Response, next);
    res.statusCode = 401; // Simulate failed login
    finishCallback();

    await new Promise((resolve) => setTimeout(resolve, 0)); // Tick microtask queue
    expect(memoryStore.get('bf:ip:127.0.0.1')).toEqual(expect.objectContaining({ count: 1 }));
    expect(memoryStore.get('bf:email:admin@example.com')).toEqual(expect.objectContaining({ count: 1 }));
  });

  it('should reset failures on 200 OK', async () => {
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(redis.del).mockResolvedValue(1);

    let finishCallback: () => void = () => {};
    res.on = vi.fn().mockImplementation((event, cb) => {
      if (event === 'finish') finishCallback = cb;
      return res;
    });

    await adminBruteForceMiddleware(req as Request, res as Response, next);
    res.statusCode = 200; // Simulate successful login
    finishCallback();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(redis.del).toHaveBeenCalledWith('bf:ip:127.0.0.1');
  });
});