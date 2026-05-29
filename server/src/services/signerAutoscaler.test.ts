import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignerAutoscaler, AutoscalerConfig } from './signerAutoscaler';

describe('SignerAutoscaler', () => {
  let config: AutoscalerConfig;
  let autoscaler: SignerAutoscaler;

  beforeEach(() => {
    config = {
      minReplicas: 2,
      maxReplicas: 10,
      targetQueueDepthPerReplica: 100,
      scaleUpCooldownMs: 15000, // 15 seconds
      scaleDownCooldownMs: 60000, // 60 seconds
    };
    autoscaler = new SignerAutoscaler(config);
  });

  it('should initialize with minReplicas', () => {
    expect(autoscaler.getCurrentReplicas()).toBe(2);
  });

  it('should throw error on invalid configuration bounds', () => {
    expect(() => new SignerAutoscaler({ ...config, minReplicas: 0 })).toThrow('minReplicas must be >= 1');
    expect(() => new SignerAutoscaler({ ...config, minReplicas: 5, maxReplicas: 3 })).toThrow('maxReplicas must be >= minReplicas');
  });

  it('should calculate scaling up when queue depth exceeds target', () => {
    const emitSpy = vi.spyOn(autoscaler, 'emit');
    // Queue depth 250 -> 250/100 = 2.5 -> ceil = 3 replicas
    const newReplicas = autoscaler.evaluateScaling(250, 100000);
    
    expect(newReplicas).toBe(3);
    expect(autoscaler.getCurrentReplicas()).toBe(3);
    expect(emitSpy).toHaveBeenCalledWith('scale', { type: 'UP', from: 2, to: 3, queueDepth: 250 });
  });

  it('should cap scale up at maxReplicas', () => {
    // Queue depth 2000 -> 2000/100 = 20 replicas. Config max is 10.
    const newReplicas = autoscaler.evaluateScaling(2000, 100000);
    expect(newReplicas).toBe(10);
  });

  it('should respect scale up cooldown period', () => {
    autoscaler.evaluateScaling(250, 100000); // Scales to 3
    expect(autoscaler.getCurrentReplicas()).toBe(3);

    // 10 seconds later (cooldown is 15s) -> Queue depth jumps to 400 (needs 4)
    autoscaler.evaluateScaling(400, 110000);
    expect(autoscaler.getCurrentReplicas()).toBe(3); // Denied by cooldown

    // 16 seconds later -> Scale should be allowed
    autoscaler.evaluateScaling(400, 116000);
    expect(autoscaler.getCurrentReplicas()).toBe(4);
  });

  it('should calculate scaling down when queue depth falls', () => {
    autoscaler.syncReplicas(5); // Start at 5
    const emitSpy = vi.spyOn(autoscaler, 'emit');
    
    // Queue depth 100 -> 100/100 = 1 replica, bounded to minReplicas = 2
    const newReplicas = autoscaler.evaluateScaling(100, 100000);
    
    expect(newReplicas).toBe(2);
    expect(emitSpy).toHaveBeenCalledWith('scale', { type: 'DOWN', from: 5, to: 2, queueDepth: 100 });
  });

  it('should cap scale down at minReplicas', () => {
    autoscaler.syncReplicas(5);
    const newReplicas = autoscaler.evaluateScaling(0, 100000); // 0 requires 0, but min is 2
    expect(newReplicas).toBe(2);
  });

  it('should respect scale down cooldown period', () => {
    autoscaler.syncReplicas(5);
    
    autoscaler.evaluateScaling(100, 100000); // Scales down to 2
    expect(autoscaler.getCurrentReplicas()).toBe(2);

    // Something causes manual override back to 5
    autoscaler.syncReplicas(5); 

    // 30 seconds later (cooldown is 60s) -> Try to scale down again
    autoscaler.evaluateScaling(100, 130000);
    expect(autoscaler.getCurrentReplicas()).toBe(5); // Denied by cooldown

    // 61 seconds later -> Allowed
    autoscaler.evaluateScaling(100, 161000);
    expect(autoscaler.getCurrentReplicas()).toBe(2);
  });
});
