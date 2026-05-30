# Network Latency Simulation

The Fluid server includes a built-in network simulation layer that allows developers to test how their applications and the Fluid SDK behave under sub-optimal network conditions.

## Why use Network Simulation?

Real-world mobile and web applications often face network instability, high latency, and intermittent connectivity. Testing only on a perfect local network or high-speed data center connection can lead to:
- Poor user experience during slow responses.
- Unhandled timeouts in the SDK.
- Race conditions that only appear when requests are delayed.
- Failure to handle 5xx errors gracefully.

## Configuration

Network simulation is controlled via environment variables. These can be set in your `.env` file or passed directly to the process.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `FLUID_NETWORK_SIMULATION_ENABLED` | boolean | `false` | Master switch to enable/disable simulation. |
| `FLUID_NETWORK_LATENCY_MS` | number | `0` | Delay in milliseconds added to every request. |
| `FLUID_NETWORK_PACKET_LOSS_RATE` | float | `0.0` | Probability (0.0 to 1.0) of a request failing. |

### Examples

#### Simulating a High-Latency Connection (e.g., 3G)
```bash
FLUID_NETWORK_SIMULATION_ENABLED=true
FLUID_NETWORK_LATENCY_MS=800
FLUID_NETWORK_PACKET_LOSS_RATE=0.01
```

#### Simulating an Unstable Network
```bash
FLUID_NETWORK_SIMULATION_ENABLED=true
FLUID_NETWORK_LATENCY_MS=100
FLUID_NETWORK_PACKET_LOSS_RATE=0.2
```

## How it Works

The simulation logic is implemented as an Express middleware registered early in the request pipeline.

1. **Packet Loss:** If `packetLossRate > 0`, the middleware rolls a random number. If it falls within the loss rate, the request is immediately terminated with either a `503 Service Unavailable` or `504 Gateway Timeout` JSON response.
2. **Latency:** If `latencyMs > 0`, the middleware uses a non-blocking `setTimeout` to delay the execution of the next middleware in the chain.

## Verification

You can verify the simulation settings using the provided benchmark script:

```bash
cd server
npm run benchmark:network
```

This will run a series of requests against the server and report the success rate and response time statistics.

## Best Practices for QA

1. **Automation:** Include network simulation in your CI/CD pipeline's integration tests to ensure new changes don't break under latency.
2. **SDK Testing:** Use high packet loss (e.g., 0.1) to verify that your SDK implementation correctly retries idempotent operations.
3. **UI/UX:** Use high latency (e.g., 2000ms) to verify that your application shows appropriate loading states and doesn't freeze the UI.
