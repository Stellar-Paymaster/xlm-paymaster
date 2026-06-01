# NGINX/Envoy API Gateway Rate-Limiting Configuration (#715)

**Issue:** #715  
**Package:** `fluid-server`

## Overview

Fluid's Rust server currently performs API key validation and rate limiting in-process. For production deployments, basic checks should be offloaded to an edge gateway (Envoy or NGINX) so the application process focuses on transaction signing and quota accounting.

This guide documents the gateway configuration shipped in `fluid-server/config/` and the Rust validation helpers in `fluid-server/src/gateway_config.rs`.

## Architecture

```
Client → Gateway (Envoy/NGINX) → fluid-server (Rust)
           │                           │
           ├─ API key presence         ├─ Quota / fee-bump signing
           ├─ Known-key allowlist      └─ Daily stroop limits
           ├─ IP rate limit (100/min)
           └─ Per-key rate limit (2–5/min)
```

### What the gateway handles

| Check | Gateway | Application |
|-------|---------|-------------|
| Missing `x-api-key` header | 401 | — |
| Unknown API key | 403 | — |
| IP rate limit (100 req/min) | 429 | Fallback if gateway disabled |
| Per-key rate limit (tier-based) | 429 | Fallback if gateway disabled |
| Daily stroop quota | — | 403 |
| Transaction signing | — | 200/4xx |

## Configuration Files

| File | Purpose |
|------|---------|
| `fluid-server/config/envoy.yaml` | Envoy listener with Lua API key validation + local rate limit filters |
| `fluid-server/config/nginx-rate-limit.conf` | NGINX alternative with `limit_req_zone` and `map`-based key validation |
| `fluid-server/src/gateway_config.rs` | Typed tier definitions and validation (must stay in sync with `state.rs`) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLUID_GATEWAY_GLOBAL_RATE_LIMIT_MAX` | `100` | Max requests per IP per window at the gateway |
| `FLUID_GATEWAY_GLOBAL_RATE_LIMIT_WINDOW_MS` | `60000` | IP rate limit window (ms) |
| `FLUID_GATEWAY_TRUSTED_HEADER` | `x-envoy-auth-status` | Header set by gateway after successful auth |
| `FLUID_GATEWAY_ENFORCE_AUTH` | `false` | When true, reject requests missing the trusted gateway header |
| `FLUID_DISABLE_RATE_LIMITS` | `false` | Bypass in-process rate limits (load testing only) |

## Envoy Deployment

```bash
# Start fluid-server behind Envoy
docker compose up fluid-server
envoy -c fluid-server/config/envoy.yaml

# Test: missing key → 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/fee-bump
# → 401

# Test: valid key passes gateway
curl -s -o /dev/null -w "%{http_code}" \
  -H "x-api-key: fluid-free-demo-key" \
  -H "Content-Type: application/json" \
  -d '{"xdr":"..."}' \
  http://localhost:8080/fee-bump
```

## NGINX Deployment

Include the rate-limit config in your main server block:

```nginx
include /etc/nginx/conf.d/fluid-rate-limit.conf;
```

The bundled config listens on port **8080** and proxies to `fluid-server:3000`.

## Tier Definitions

Demo tiers match `fluid-server/src/state.rs`:

| API Key | Tier | Max Requests | Window |
|---------|------|--------------|--------|
| `fluid-free-demo-key` | free | 2 | 60s |
| `fluid-pro-demo-key` | pro | 5 | 60s |

When adding production keys, update **both** the gateway config and `GatewayConfig::default_api_key_tiers()`.

## Security Considerations

- Gateway allowlists are appropriate for **basic** key checks only. Rotate keys via your secrets manager and sync gateway configs on deploy.
- Always terminate TLS at the gateway or load balancer; never expose the Rust process directly.
- Set `FLUID_GATEWAY_ENFORCE_AUTH=true` in production so requests cannot bypass the gateway by hitting the Rust port directly.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`) are set at both gateway and application layers for observability.

## Running Tests

```bash
cd fluid-server
cargo test gateway_config
```

## Edge Cases

- **Empty `x-api-key` header**: Gateway returns 401 before the request reaches Rust.
- **Unknown key**: Gateway returns 403; no database lookup occurs.
- **Rate limit burst**: Envoy local rate limit returns 429 with standard headers; clients should honour `Retry-After`.
- **Gateway bypass**: When `FLUID_GATEWAY_ENFORCE_AUTH=true`, direct requests to the Rust port without `x-envoy-auth-status: allowed` are rejected.
- **Load testing**: Set `FLUID_DISABLE_RATE_LIMITS=true` on the Rust process and raise gateway limits independently.
