import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipFilterMiddleware } from './ipFilter';
import { AppError } from '../errors/AppError';

vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
  }),
}));

describe('ipFilterMiddleware', () => {
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    vi.resetModules();
    req = { ip: '192.168.1.5' };
    res = {};
    next = vi.fn();
    delete process.env.IP_ALLOWLIST;
    delete process.env.IP_DENYLIST;
  });

  it('should allow any IP when no lists are configured', () => {
    ipFilterMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('should block an IP present in the denylist', () => {
    process.env.IP_DENYLIST = '192.168.1.0/24';
    ipFilterMiddleware(req, res, next);
    
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('IP_FORBIDDEN');
  });

  it('should block an IP not present in the allowlist', () => {
    process.env.IP_ALLOWLIST = '10.0.0.1, 10.0.0.0/8';
    ipFilterMiddleware(req, res, next);
    
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].code).toBe('IP_FORBIDDEN');
  });

  it('should allow an IP present in the allowlist', () => {
    process.env.IP_ALLOWLIST = '192.168.1.0/24';
    ipFilterMiddleware(req, res, next);
    
    expect(next).toHaveBeenCalledWith();
  });

  it('should prioritize denylist over allowlist (deny wins)', () => {
    // IP is in both CIDR ranges
    process.env.IP_ALLOWLIST = '192.168.0.0/16';
    process.env.IP_DENYLIST = '192.168.1.5';
    
    ipFilterMiddleware(req, res, next);
    
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].code).toBe('IP_FORBIDDEN');
  });

  it('should handle multiple comma-separated entries', () => {
    process.env.IP_DENYLIST = '1.1.1.1, 2.2.2.2, 192.168.1.5';
    ipFilterMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('should handle IPv6 addresses', () => {
    req.ip = '2001:db8::1';
    process.env.IP_ALLOWLIST = '2001:db8::/32';
    ipFilterMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});