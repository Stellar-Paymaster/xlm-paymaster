# Rate Limiting & Quotas

The Fluid API enforces rate limits to ensure stability, fair usage, and security across all tenants. Rate limits operate on a per-API-key basis and use a **Leaky Bucket algorithm** backed by Redis.

## How the Leaky Bucket Algorithm Works
Instead of simply counting requests in fixed time windows (which allows harmful "bursts" of traffic precisely at the window boundaries), the server uses the **Generic Cell Rate Algorithm (GCRA)** to implement a continuous "leaky bucket."

### Mechanics
1. **Capacity (Burst)**: The bucket has a maximum capacity equal to your tier's `rateLimit`.
2. **Leak Rate**: The bucket continuously leaks (refills its capacity) at a steady rate of `rateLimit / windowMs`.
3. **Execution**: 
   - Each API request adds exactly 1 "drop" to the bucket.
   - If adding a drop would overflow the bucket, the request is rejected with a `429 Too Many Requests` status.

This approach means that sustained traffic is smoothly throttled exactly to the allowed rate limit, offering stronger resilience against DDOS attacks and eliminating edge-case latency spikes.

## Rate Limit Headers
When you make a request, the API includes standard headers informing you of your rate limit status:

- `X-RateLimit-Limit`: The maximum burst capacity of your bucket.
- `X-RateLimit-Remaining`: How many requests you can make *immediately* without being throttled.
- `X-RateLimit-Reset`: The UNIX epoch timestamp (in seconds) when the bucket will be completely empty.

If you exceed your rate limit, the API responds with `429 Too Many Requests` and includes an additional JSON property:
- `retryAfterSeconds`: The exact number of seconds you must wait before you have enough capacity to make another request.

## Fallback Mechanisms
In the rare event that the primary Redis rate-limiting datastore becomes unavailable, the server automatically degrades to an in-memory leaky bucket simulation. This ensures rate limits continue to be enforced accurately across node processes without requiring complete system downtime.
