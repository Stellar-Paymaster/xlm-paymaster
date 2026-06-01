# Horizontal Scaling: Stateless Node API

This document explains how to run multiple Node API replicas behind a load balancer and what makes the server safe to scale horizontally.

## Why stateless matters

A stateful server keeps per-request or per-connection data in process memory. When a load balancer routes successive requests from the same client to different replicas, each replica sees a fresh, empty state and may produce inconsistent results — for example, a rate limit that resets on every hop, or an API key that is valid on replica A but unknown to replica B.

Fluid's Node API eliminates per-instance state by storing all shared data in Redis:

| State | Storage |
|-------|---------|
| API key configuration | Redis (TTL 300 s) → PostgreSQL → in-memory dev fallback |
| Rate limit counters (GCRA leaky bucket) | Redis Lua script |
| Job queues (BullMQ) | Redis Streams |
| Admin sessions | JWT (stateless by definition) |

The remaining in-memory data structures (`API_KEYS` map in `apiKeys.ts`, `usageByApiKey` map in `rateLimit.ts`) are development fallbacks that are active only when Redis is unreachable. Set `STATELESS_MODE=true` to disable these fallbacks and enforce that all state lives in Redis.

## Running a local scale test

The `docker-compose.scale.yml` file configures three node-api replicas behind an nginx load balancer.

```bash
# Build images once
docker compose -f docker-compose.scale.yml build

# Start the stack with 3 node-api replicas
docker compose -f docker-compose.scale.yml up --scale node-api=3
```

The node-api is reachable through nginx on **port 3001**. Individual replica ports are not exposed.

Verify all three replicas handle requests correctly:

```bash
# Send 9 requests and observe which container serves each one
for i in $(seq 1 9); do
  curl -s -o /dev/null -w "HTTP %{http_code}\n" \
    -H "x-api-key: your_test_key" \
    http://localhost:3001/health
done
```

Inspect replica logs to confirm round-robin distribution:

```bash
docker compose -f docker-compose.scale.yml logs node-api
```

## Production load balancer (nginx)

`infra/nginx.conf` is a minimal nginx configuration suitable for production use. Key settings:

- `upstream fluid_node_api` — round-robin across all `node-api` replicas
- `keepalive 32` — persistent upstream connections to reduce per-request overhead
- `proxy_set_header X-Forwarded-For` — real client IP forwarded for IP filtering middleware
- Timeouts tuned for the expected fee-bump signing latency

For Caddy, the equivalent `Caddyfile`:

```caddy
:3001 {
    reverse_proxy node-api:3001 {
        lb_policy round_robin
        header_up X-Forwarded-For {remote_host}
    }
}
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STATELESS_MODE` | `false` | Set `true` to disable in-memory API key and rate limit fallbacks. Required when running more than one replica. |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection string shared by all replicas. |
| `TRUST_PROXY` | `false` | Set `true` when running behind a trusted reverse proxy so that `X-Forwarded-For` is used for IP filtering. |

## JWT authentication

Admin endpoints use JWT tokens issued by `/admin/auth/login`. JWT is stateless by design — any replica can verify a token using the shared `AUTH_SECRET` without consulting a session store. No additional configuration is required for horizontal scaling of the admin API.

## Kubernetes

For production Kubernetes deployments see the [Helm chart](../helm/fluid/README.md) in `helm/fluid/`. The chart configures a HorizontalPodAutoscaler that scales the node-api deployment automatically based on CPU utilisation and requests per second.
