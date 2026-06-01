import { describe, it, expect, vi } from 'vitest';
import { ApiChaosMonkey } from './apiChaosMonkey';

describe('ApiChaosMonkey', () => {
  it('should not drop connection if disabled', () => {
    const chaosMonkey = new ApiChaosMonkey({ dropProbability: 1.0, enabled: false });
    const req = {};
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    chaosMonkey.middleware()(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should drop connection based on probability', () => {
    // Math.random will return 0.1, which is < 0.5, so it drops
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const chaosMonkey = new ApiChaosMonkey({ dropProbability: 0.5, enabled: true });
    
    const req = {};
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    chaosMonkey.middleware()(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Service Unavailable - Chaos Monkey Intervention' });
    
    vi.restoreAllMocks();
  });

  it('should pass connection if probability not met', () => {
    // Math.random will return 0.9, which is > 0.5, so it passes
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const chaosMonkey = new ApiChaosMonkey({ dropProbability: 0.5, enabled: true });
    
    const req = {};
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    chaosMonkey.middleware()(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
