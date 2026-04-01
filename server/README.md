# Fluid Server

The Fluid server is a Node.js/TypeScript HTTP service that wraps signed Stellar transactions in fee-bump transactions. This allows applications to let users pay with the token they're spending (e.g., USDC) without requiring users to hold XLM for fees or the application to manage gas abstraction.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

Edit `.env` and set `FLUID_FEE_PAYER_SECRET`.

3. Build and run:

```bash
npm run build
npm start
```

Or for development:

```bash
npm run dev
```

## Configuration

See `.env.example` for all configuration options.

Required:

- Fee payer key material:
  - Development-only fallback: `FLUID_FEE_PAYER_SECRET` (comma-separated Stellar secrets)
  - Production (recommended): HashiCorp Vault KV (see `docs/vault.md`)

Optional:

- `FLUID_BASE_FEE` - Base fee in stroops (default: 100)
- `FLUID_FEE_MULTIPLIER` - Fee multiplier (default: 2.0)
- `LOG_LEVEL` - Logger level: `debug`, `info`, `warn`, or `error` (default: `debug` in development, `info` in production)
- `LOG_PRETTY` - Enable `pino-pretty` in non-production environments (default: `false`, which preserves JSON logs)
- `STELLAR_NETWORK_PASSPHRASE` - Network passphrase (default: Testnet)
- `STELLAR_HORIZON_URL` - Legacy single Horizon URL
- `STELLAR_HORIZON_URLS` - Comma-separated Horizon URL list for failover
- `FLUID_HORIZON_SELECTION` - `priority` or `round_robin` node selection (default: `priority`)
- `PORT` - Server port (default: 3000)
- `FLUID_RATE_LIMIT_WINDOW_MS` - Rate limit window in milliseconds (default: 60000)
- `FLUID_RATE_LIMIT_MAX` - Max requests per window per IP (default: 5)
- `FLUID_ALLOWED_ORIGINS` - Comma-separated CORS allowlist
- `FLUID_GRPC_ENGINE_ADDRESS` - Internal Rust gRPC signer target such as `127.0.0.1:50051`
- `FLUID_GRPC_ENGINE_TLS_SERVER_NAME` - Expected Rust engine TLS server name / SAN (default: `fluid-grpc-engine.internal`)
- `FLUID_GRPC_ENGINE_CLIENT_CA_PATH` - PEM bundle for the pinned internal CA trust anchor
- `FLUID_GRPC_ENGINE_CLIENT_CERT_PATH` / `FLUID_GRPC_ENGINE_CLIENT_KEY_PATH` - Node API client certificate and private key used for mTLS
- `FLUID_GRPC_ENGINE_PINNED_SERVER_CERT_SHA256` - Optional comma-separated SHA-256 fingerprints for the Rust engine server certificate; include both old and new values during rotation
- `LOW_BALANCE_ALERT_XLM` - Primary low balance threshold env var for fee payer balances
- `FLUID_LOW_BALANCE_THRESHOLD_XLM` - Backward-compatible low balance threshold env var
- `LOW_BALANCE_ALERT_CHECK_INTERVAL_MS` / `FLUID_LOW_BALANCE_CHECK_INTERVAL_MS` - Balance polling interval (default: 300000 / 5 minutes)
- `LOW_BALANCE_ALERT_COOLDOWN_MS` / `FLUID_LOW_BALANCE_ALERT_COOLDOWN_MS` - Minimum time between repeated alerts per account (minimum enforced: 3600000 / 1 hour)
- `PAGERDUTY_ROUTING_KEY` - PagerDuty Events API v2 routing key for P1 incident alerts
- `PAGERDUTY_SERVICE_NAME` - Service name shown in PagerDuty payloads (default: `Fluid server`)
- `PAGERDUTY_SOURCE` - PagerDuty payload source (default: `fluid-server`)
- `PAGERDUTY_COMPONENT` - PagerDuty component tag (default: `fee-sponsorship`)
- `SLACK_WEBHOOK_URL` - Slack incoming webhook URL used for critical ops alerts
- `SLACK_ALERT_LOW_BALANCE_ENABLED` - Enable or disable low balance Slack alerts (default: `true`)
- `SLACK_ALERT_5XX_ENABLED` - Enable or disable 5xx error Slack alerts (default: `true`)
- `SLACK_ALERT_SERVER_LIFECYCLE_ENABLED` - Enable or disable server start/stop Slack alerts (default: `true`)
- `SLACK_ALERT_FAILED_TRANSACTION_ENABLED` - Enable or disable failed transaction alerts (default: `true`)
- `FLUID_ALERT_SLACK_WEBHOOK_URL` - Backward-compatible alias for `SLACK_WEBHOOK_URL`
- `FLUID_ALERT_SMTP_HOST` / `FLUID_ALERT_SMTP_PORT` / `FLUID_ALERT_SMTP_SECURE` - SMTP connection settings
- `FLUID_ALERT_SMTP_USER` / `FLUID_ALERT_SMTP_PASS` - Optional SMTP auth
- `FLUID_ALERT_EMAIL_FROM` / `FLUID_ALERT_EMAIL_TO` - Email sender and comma-separated recipients
- `RESEND_API_KEY` / `RESEND_EMAIL_FROM` / `RESEND_EMAIL_TO` - Optional Resend API transport for low-balance alerts
- `FLUID_ALERT_DASHBOARD_URL` - Dashboard link included in low-balance emails

Rust gRPC engine env vars:

- `FLUID_GRPC_ENGINE_LISTEN_ADDR` - Bind address for the Rust signer engine (default: `127.0.0.1:50051`)
- `FLUID_GRPC_ENGINE_TLS_CERT_PATH` / `FLUID_GRPC_ENGINE_TLS_KEY_PATH` - Rust engine server certificate and private key
- `FLUID_GRPC_ENGINE_TLS_CLIENT_CA_PATH` - PEM bundle used by the Rust engine to verify Node API client certificates
- `FLUID_GRPC_ENGINE_PINNED_CLIENT_CERT_SHA256` - Optional comma-separated SHA-256 fingerprints for allowed Node API client certificates

Mock API keys for local development:

- `fluid-free-demo-key` - Free tier, 2 requests per minute
- `fluid-pro-demo-key` - Pro tier, 5 requests per minute

## API Endpoints

### GET /health

Health check endpoint.

Response:

```json
{
  "status": "ok",
  "low_balance_alerting": {
    "enabled": true
  }
}
```

### POST /test/alerts/low-balance

Sends a manual low-balance alert through the configured Slack webhook and/or email transport. This is useful for capturing the required review screenshot without draining a real account first.

Low-balance emails support SMTP and Resend transport configuration. Each fee-payer account is debounced to at most one alert per hour, and the message includes the fee payer public key, current balance, threshold, and a dashboard link when `FLUID_ALERT_DASHBOARD_URL` is configured.

## PagerDuty Incidents

PagerDuty incidents are created via the Events API v2 when `PAGERDUTY_ROUTING_KEY` is configured. Fluid triggers and resolves incidents for:

- zero usable signing accounts
- Horizon unreachable for more than 60 seconds
- server restart (auto-resolved after recovery)

Each incident type uses a stable `dedup_key` so repeated triggers are collapsed into the same incident.

## Webhook Signing

Outbound tenant webhooks are signed with `HMAC-SHA256` using the tenant-specific `webhookSecret` stored in the database. Every signed delivery includes:

- `Content-Type: application/json`
- `X-Fluid-Signature-256: sha256=<hex digest>`

Tenants configure webhook delivery with `PATCH /tenant/webhook`:

```json
{
  "webhookUrl": "https://example.com/fluid/webhooks",
  "webhookSecret": "replace-with-a-long-random-secret"
}
```

The API never returns the raw secret. It only returns whether a secret is configured.

If a tenant has a webhook URL but no `webhookSecret`, Fluid logs the misconfiguration and refuses to send an unsigned webhook.

### Verify in Node.js

```js
import crypto from "node:crypto";

function verifyFluidWebhook(rawBody, signatureHeader, secret) {
  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;

  const actual = signatureHeader || "";
  const matches =
    actual.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));

  if (!matches) {
    console.error("Fluid webhook signature validation failed", {
      expected,
      received: actual,
    });
  }

  return matches;
}
```

### Verify in Python

```python
import hmac
from hashlib import sha256


def verify_fluid_webhook(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"),
        raw_body,
        sha256,
    ).hexdigest()
    actual = signature_header or ""
    matches = hmac.compare_digest(actual, expected)

    if not matches:
        print(
            "Fluid webhook signature validation failed",
            {"expected": expected, "received": actual},
        )

    return matches
```

## Slack Alerts

Critical alerts are posted to Slack as Block Kit messages with a severity emoji, ISO timestamp, and event detail. The server currently emits Slack alerts for:

- low fee-payer balance
- 5xx request failures
- server lifecycle events (start and stop)
- failed transactions observed by the ledger monitor

Each Slack event type can be toggled independently with the `SLACK_ALERT_*_ENABLED` environment variables.

### POST /fee-bump

Wraps a signed transaction in a fee-bump transaction.

Request:

```json
{
  "xdr": "<base64_encoded_signed_transaction_xdr>",
  "submit": false
}
```

Headers:

```http
x-api-key: fluid-free-demo-key
```

Response:

```json
{
  "xdr": "<base64_encoded_fee_bump_transaction_xdr>",
  "status": "ready",
  "hash": null
}
```

If `submit: true` and Horizon URLs are configured, the server will submit the transaction and return the hash.

## Horizon Failover

The server now supports redundant Horizon submission and monitoring:

- Configure multiple nodes with `STELLAR_HORIZON_URLS`
- Use `FLUID_HORIZON_SELECTION=priority` to always prefer the first healthy node
- Use `FLUID_HORIZON_SELECTION=round_robin` to rotate the starting node each request
- Retry only retryable failures such as connection resets, timeouts, DNS failures, and 5xx/429 gateway responses
- Do not retry final submission errors such as invalid transaction payloads returned as 4xx responses

`GET /health` now includes `horizon_nodes` with each node's `Active` or `Inactive` status.

If a key exceeds its tier limit, the server returns `429 Too Many Requests` with a response that cites the API key limit.

## Rate Limit Verification

You can verify that rate limiting is applied per API key by sending three requests with the free key and then one with the pro key:

```bash
curl -X POST http://127.0.0.1:3000/fee-bump \
  -H "Content-Type: application/json" \
  -H "x-api-key: fluid-free-demo-key" \
  --data '{"xdr":"AAAA","submit":false}'
```

Repeat the same request three times within one minute. The first two requests will reach the handler, and the third returns `429 Too Many Requests`.

Then send the same request with the pro key:

```bash
curl -X POST http://127.0.0.1:3000/fee-bump \
  -H "Content-Type: application/json" \
  -H "x-api-key: fluid-pro-demo-key" \
  --data '{"xdr":"AAAA","submit":false}'
```

That request still goes through because the limit is tracked separately per API key.

## Architecture

- Express.js - HTTP server framework
- TypeScript - Type-safe code
- @stellar/stellar-sdk - Stellar SDK for transaction handling
- Rust + `ed25519-dalek` - Non-blocking fee-payer signature generation through a native N-API module or the internal mTLS gRPC signer engine

## Internal gRPC mTLS

The Node API can delegate fee-payer signatures to the Rust signer engine over an internal gRPC channel protected by mutual TLS.

- The Node API presents its own client certificate and verifies the Rust engine certificate against a dedicated internal CA bundle.
- The Rust engine requires a client certificate signed by the configured CA bundle and can additionally pin exact client certificate SHA-256 fingerprints.
- The Node API can additionally pin exact server certificate SHA-256 fingerprints.
- TLS material is loaded from PEM files, and the Node gRPC client recreates its channel automatically when those files change.

Local developer flow and production rotation guidance are documented in [docs/grpc-mtls.md](../docs/grpc-mtls.md).

## Development

```bash
npm run dev
npm run build
npm start
npm run watch
npm run demo:horizon-failover
```

## Logging

The server uses `pino` as the primary logger. Logs are emitted as structured JSON by default so fields such as `level`, `tenant_id`, `tx_hash`, and `fee_payer` can be indexed by Datadog, ELK, or CloudWatch.

Example JSON log:

```json
{
  "level": "info",
  "time": "2026-03-25T18:05:41.221Z",
  "service": "fluid-server",
  "env": "production",
  "component": "fee_bump_handler",
  "msg": "Fee bump transaction submitted successfully",
  "tenant_id": "tenant_123",
  "tx_hash": "3f1d9b...",
  "fee_payer": "GABCD...",
  "node_url": "https://horizon-testnet.stellar.org",
  "submission_attempts": 1,
  "final_fee_stroops": 200
}
```

If you want human-readable logs locally, set `LOG_PRETTY=true` while keeping `NODE_ENV` outside production.

## Signing Benchmark

Run the benchmark locally with:

```bash
npm run benchmark:signing
```

That command builds the Rust signer, compares it against the current Node.js signing path, and writes the report to `server/benchmarks/signing-report.md`.
The GitHub Actions benchmark workflow also writes the same report back to the feature branch after a successful run.

## Signer Pool Test

Run the multi-account concurrency test with:

```bash
npm run test:signer-pool
```

That command builds the native signer, exercises the `SignerPool` across five concurrent accounts plus a 200-request load burst, and prints `POOL_TEST` log lines showing five distinct accounts signing five different transactions simultaneously.

## Project Structure

```
server/
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── middleware/
│   │   ├── apiKeys.ts
│   │   └── rateLimit.ts
│   └── handlers/
│       └── feeBump.ts
├── dist/
├── package.json
├── tsconfig.json
└── README.md
```
