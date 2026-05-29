import { EventEmitter } from 'events';

export interface AutoscalerConfig {
  minReplicas: number;
  maxReplicas: number;
  targetQueueDepthPerReplica: number;
  scaleUpCooldownMs: number;
  scaleDownCooldownMs: number;
}

export class SignerAutoscaler extends EventEmitter {
  private currentReplicas: number;
  private lastScaleUpTime: number = 0;
  private lastScaleDownTime: number = 0;

  constructor(private config: AutoscalerConfig) {
    super();
    // Enforce valid configuration
    if (config.minReplicas < 1) throw new Error('minReplicas must be >= 1');
    if (config.maxReplicas < config.minReplicas) throw new Error('maxReplicas must be >= minReplicas');
    
    this.currentReplicas = config.minReplicas;
  }

  /**
   * Evaluates the current queue depth and updates the desired replica count.
   * Emits 'scale' events if a scaling threshold is reached and cooldown has elapsed.
   */
  public evaluateScaling(currentQueueDepth: number, currentTimeMs: number = Date.now()): number {
    // 1. Calculate the ideal number of replicas based on load
    const desiredReplicasRaw = Math.ceil(currentQueueDepth / this.config.targetQueueDepthPerReplica);
    
    // 2. Bound the request to configured min/max
    const desiredReplicas = Math.max(
      this.config.minReplicas,
      Math.min(this.config.maxReplicas, desiredReplicasRaw)
    );

    // 3. Apply Cooldowns & Trigger Scaling
    if (desiredReplicas > this.currentReplicas) {
      if (currentTimeMs - this.lastScaleUpTime >= this.config.scaleUpCooldownMs) {
        const oldReplicas = this.currentReplicas;
        this.currentReplicas = desiredReplicas;
        this.lastScaleUpTime = currentTimeMs;
        this.emit('scale', { type: 'UP', from: oldReplicas, to: this.currentReplicas, queueDepth: currentQueueDepth });
      }
    } else if (desiredReplicas < this.currentReplicas) {
      if (currentTimeMs - this.lastScaleDownTime >= this.config.scaleDownCooldownMs) {
        const oldReplicas = this.currentReplicas;
        this.currentReplicas = desiredReplicas;
        this.lastScaleDownTime = currentTimeMs;
        this.emit('scale', { type: 'DOWN', from: oldReplicas, to: this.currentReplicas, queueDepth: currentQueueDepth });
      }
    }

    return this.currentReplicas;
  }

  /**
   * Forcibly override the current replica count, bypassing logic and cooldowns.
   * Useful when syncing state with an external orchestration engine like Kubernetes.
   */
  public syncReplicas(replicas: number): void {
    this.currentReplicas = Math.max(
      this.config.minReplicas,
      Math.min(this.config.maxReplicas, replicas)
    );
  }

  public getCurrentReplicas(): number {
    return this.currentReplicas;
  }
  
  public getConfig(): AutoscalerConfig {
    return this.config;
  }
}