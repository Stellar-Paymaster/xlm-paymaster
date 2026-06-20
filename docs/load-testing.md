# XLM Paymaster Load Testing Guide (k6 and Locust)

This document provides guidelines and instructions for executing load testing against the XLM Paymaster server's `/fee-bump` endpoint. Load testing verifies that the server meets the performance requirement of handling 1,000 requests per second (RPS) under peak CPU and memory conditions.

---

## Architecture Overview

XLM Paymaster is a high-performance Stellar fee-bump relay server written in Rust. In production, rate limits and daily fee sponsorship quotas protect the system resources:
* **IP Rate Limiting**: Limit on the number of requests per IP.
* **API Key Rate Limiting**: Limit based on the client tier (Free vs. Pro).
* **Quota Limits**: Daily fee limits per tenant.

For load testing (e.g. simulating 1,000 RPS), these limits must be bypassed so the tests measure the raw processing speed and signing capacity of the Rust server rather than being blocked by rate limiting rules.

### Performance Test Mode (`PAYMASTER_DISABLE_RATE_LIMITS`)

XLM Paymaster supports a performance-testing configuration flag:
* **Environment Variable**: `PAYMASTER_DISABLE_RATE_LIMITS=true`
* **Behavior**: Bypasses the IP rate limiter, API key rate limiter, and daily sponsorship quota checks. All requests from validated API keys proceed to signing.

---

## k6 Load Testing

[k6](https://k6.io/) is used for developer-centric, high-performance load testing. The k6 script uses a constant-arrival-rate executor to guarantee exactly 1,000 RPS.

### Execution Script
The k6 script is located at:
[paymaster-server/k6/fee_bump_stress.js](file:///home/edohwares/Desktop/Room/drips/xlm-paymaster/paymaster-server/k6/fee_bump_stress.js)

### Running k6
To run the stress test against a local server:
```bash
# 1. Start the XLM Paymaster server with rate limits disabled
PAYMASTER_DISABLE_RATE_LIMITS=true PAYMASTER_FEE_PAYER_SECRET=... cargo run --release

# 2. Run k6 stress test
k6 run paymaster-server/k6/fee_bump_stress.js
```

---

## Locust Load Testing

[Locust](https://locust.io/) is a Python-based user load testing tool. The Locust script uses `FastHttpUser` to maximize client-side request generation efficiency.

### Execution Script
The Locust script is located at:
[paymaster-server/locust/locustfile.py](file:///home/edohwares/Desktop/Room/drips/xlm-paymaster/paymaster-server/locust/locustfile.py)

### Running Locust
To run the Locust test:
```bash
# 1. Start the XLM Paymaster server with rate limits disabled
PAYMASTER_DISABLE_RATE_LIMITS=true PAYMASTER_FEE_PAYER_SECRET=... cargo run --release

# 2. Run Locust in headless mode targeting 1000 requests/sec
locust -f paymaster-server/locust/locustfile.py --headless -u 200 -r 50 --run-time 3m --host http://localhost:3000
```

---

## Verification & Edge Cases

The load testing integration handles multiple edge cases gracefully:
1. **Invalid XDR Payload**: If clients send corrupt transaction envelopes, they are rejected with `HTTP 400 Bad Request` prior to acquiring signer leases, protecting the thread pool from resource starvation.
2. **Quota Handling**: When rate limits are enabled, clients exceeding daily quotas receive `HTTP 403 Forbidden`. When `PAYMASTER_DISABLE_RATE_LIMITS=true` is set, quotas are bypassed, permitting continuous load simulation.
3. **API Key Authentication**: Even with rate limits bypassed, clients must supply a valid API key header (`X-API-Key`) to prevent unauthorized access.
