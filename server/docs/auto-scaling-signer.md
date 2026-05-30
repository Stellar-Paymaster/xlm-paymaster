# Auto-scaling Logic for Signer

**Status:** Implemented — `server/src/services/signerAutoscaler.ts`
**Scope:** `server/`

## 1. Problem

During high traffic periods, transaction signing operations can bottleneck at the Rust gRPC engine if the incoming queue depth exceeds the processing throughput. This results in unacceptable latencies and potential timeouts for client requests. Conversely, running a statically high number of pods during quiet periods wastes memory and compute resources.

## 2. Architecture

We implemented a custom in-process horizontal autoscaling coordinator: `SignerAutoscaler`. This service monitors the pending signing queue depth and deterministically triggers scaling events based on configurable heuristic boundaries.

### Features
- **Queue-Based Heuristics**: Replicas are calculated using `ceil(currentQueueDepth / targetQueueDepthPerReplica)`.
- **Min/Max Bounding**: Strict guardrails ensure the cluster neither over-scales to cause OOM cascading nor scales to zero.
- **Differentiated Cooldowns**: Scale-up and scale-down operations have independent debouncing (`scaleUpCooldownMs` vs `scaleDownCooldownMs`). Fast scale-ups allow immediate responses to traffic spikes, while delayed scale-downs prevent "thrashing" (frequent oscillating between pod counts).
- **Event-Driven Subsystem**: The coordinator strictly manages state math and emits a generic `'scale'` event, allowing orchestration-layer code (e.g., K8s API client wrappers) to enact the scaling action cleanly.

## 3. Usage Example

```typescript
const config = {
  minReplicas: 2,
  maxReplicas: 20,
  targetQueueDepthPerReplica: 50,
  scaleUpCooldownMs: 10000,   // 10s reaction time
  scaleDownCooldownMs: 60000, // 1m stabilization
};

const autoscaler = new SignerAutoscaler(config);

autoscaler.on('scale', (event) => {
  logger.info(`Scaling ${event.type} from ${event.from} to ${event.to}. Depth: ${event.queueDepth}`);
  // Dispatch request to Kubernetes API to update Deployment Replicas
  k8sClient.scaleDeployment('fluid-rust-engine', event.to);
});

// Run this periodically or trigger based on message-broker hooks
setInterval(() => {
  const currentDepth = getSigningQueueDepth();
  autoscaler.evaluateScaling(currentDepth);
}, 2000);
```

## 4. Testing

Unit tests run comprehensively via `vitest` covering boundary checks, cooldown validation, and generic math correctness.