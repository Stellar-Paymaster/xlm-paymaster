# gRPC Rate Limiting

## Overview

Implements rate-limiting middleware for gRPC handlers in fluid-server to protect transaction endpoints from rapid-fire spam and ensure service stability.

## Architecture

### Rate Limiter Design

- **Algorithm**: Sliding Window with timestamp tracking
- **Storage**: In-memory with tokio async locks
- **Granularity**: Per IP address or custom key
- **Configurable**: Default and custom limits per request

### Components

1. **RateLimiter** (`fluid-server/src/rate_limiter.rs`)
   - Sliding window implementation
   - Thread-safe with RwLock
   - Automatic cleanup of expired requests

2. **gRPC Integration** (`fluid-server/src/grpc.rs`)
   - Rate limit check on `sign()` RPC handler
   - Client IP extraction from request metadata
   - Resource exhausted error response

## Sliding Window Algorithm

The sliding window algorithm works as follows:

1. **Request tracking**: Each request timestamp is recorded
2. **Window cleanup**: Requests outside the time window are removed
3. **Limit check**: If request count < limit, allow request and record timestamp
4. **Rejection**: If at limit, reject with 429 Resource Exhausted error

Example (100 requests per 60 seconds):
```
Window: [now - 60000ms, now]
Requests in window: 45
New request allowed? Yes (45 < 100)
After request: 46 tracked timestamps
```

## Default Configuration

- **Limit**: 100 requests per IP
- **Window**: 60 seconds (60,000 milliseconds)
- **Applied to**: gRPC `sign()` endpoint

## API Usage

### Basic Usage

```rust
let limiter = RateLimiter::new(100, 60_000); // 100 req/60s

if limiter.is_allowed("client-ip-address").await {
    // Process request
} else {
    // Return error: "Rate limit exceeded"
}
```

### Custom Limits Per Request

```rust
let allowed = limiter.is_allowed_with_limits(
    "key",
    200,      // requests
    60_000,   // milliseconds
).await;
```

### Monitoring

```rust
let count = limiter.get_request_count("key").await;
let tracked = limiter.get_tracked_keys_count().await;

limiter.reset("key").await;
limiter.clear_all().await;
```

## gRPC Integration

### Request Flow

1. **Client sends request**: `SignRequest` with XDR, secret key, network passphrase
2. **Rate limit check**: Extract client IP, check rate limit
3. **Check failure**: Return `Status::resource_exhausted("Rate limit exceeded...")`
4. **Check success**: Proceed to request validation and signing

### Error Response

Rate-limited requests receive:

```
Status: RESOURCE_EXHAUSTED
Message: "Rate limit exceeded for this endpoint"
```

### Logging

All gRPC requests are logged with:
- Request type (SignRequest)
- XDR length
- Client IP address
- Rate limit status (implicit in logs)

## Files Modified

- `fluid-server/src/lib.rs` - Added rate_limiter module declaration
- `fluid-server/src/rate_limiter.rs` - New rate limiter implementation
- `fluid-server/src/grpc.rs` - Integrated rate limiting into sign handler

## Features

- ✓ Sliding window rate limiting algorithm
- ✓ Per-IP rate limiting
- ✓ Customizable limits and windows
- ✓ Automatic request timestamp cleanup
- ✓ Thread-safe with async support
- ✓ Zero-copy memory usage
- ✓ Request count tracking
- ✓ Comprehensive test suite

## Test Coverage

8 integration tests covering:
- Rate limiting enforcement
- Multi-key isolation
- Custom limit configuration
- Request count tracking
- Key reset functionality
- Bulk clear operation
- Edge cases and boundary conditions

## Performance Characteristics

- **Memory**: O(n) where n = unique keys
- **Time Complexity**: O(m) where m = requests in window
- **Cleanup**: Automatic during each check, no background cleanup
- **Concurrency**: Full async support, non-blocking reads

## Configuration Example

```rust
// Initialize with defaults
let limiter = Arc::new(RateLimiter::new(100, 60_000));

// Create gRPC signer with rate limiter
let signer = FluidSignerGrpc::new(limiter.clone());

// Start server
Server::builder()
    .add_service(SignerServiceServer::new(signer))
    .serve(addr)
    .await?
```

## Tuning Recommendations

### High-Volume Legitimate Traffic
- Increase limit: 500-1000 requests/minute per IP
- Window: 60,000ms (1 minute)

### Strict Security Posture
- Decrease limit: 10-20 requests/minute per IP
- Window: 60,000ms (1 minute)

### Burst Tolerance
- Use larger window: 120,000ms (2 minutes)
- Allow more requests in window

## Monitoring and Alerting

Track:
- `rate_limit_exceeded_count` - Total rate limit rejections
- `tracked_keys_count` - Active client IPs in memory
- `average_requests_per_client` - Load distribution

Alert when:
- Rate limit errors exceed 5% of total requests
- Tracked keys exceed 10,000 (memory pressure)
- Single client exceeds 80% of limit

## Future Enhancements

- Distributed rate limiting across multiple instances
- Per-tenant/API-key rate limits
- Dynamic limit adjustment based on load
- Redis-backed distributed state
- Gradual backoff response (429 with Retry-After header)
