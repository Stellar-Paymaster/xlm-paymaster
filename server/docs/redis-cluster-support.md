# Redis Cluster Support

## Overview

The Fluid server now supports Redis Cluster for distributed rate limiting and caching. This enables horizontal scaling across multiple server instances while maintaining consistent rate limiting state.

## Configuration

### Single Redis Instance (Default)

To use a single Redis instance, set the `REDIS_URL` environment variable:

```bash
REDIS_URL=redis://localhost:6379
```

### Redis Cluster

To use Redis Cluster, set the `REDIS_CLUSTER_NODES` environment variable with a comma-separated list of cluster nodes:

```bash
REDIS_CLUSTER_NODES=redis://node1:6379,redis://node2:6379,redis://node3:6379
```

### Advanced Cluster Options

Additional cluster options can be provided as JSON via `REDIS_CLUSTER_OPTIONS`:

```bash
REDIS_CLUSTER_OPTIONS='{"scaleReads": "slave", "slotsRefreshTimeout": 10000}'
```

Available options include:
- `scaleReads`: Where to send read queries ("master", "slave", "all", or custom function)
- `slotsRefreshTimeout`: Timeout for slots refresh in milliseconds
- `enableOfflineQueue`: Whether to queue commands when all connections are disconnected
- `maxRedirections`: Maximum number of redirections (MOVED errors) allowed

## Environment Variables Summary

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Single Redis instance URL | `redis://127.0.0.1:6379` |
| `REDIS_CLUSTER_NODES` | Comma-separated Redis Cluster nodes | Not set |
| `REDIS_CLUSTER_OPTIONS` | JSON string with cluster options | Not set |
| `STATELESS_MODE` | Require Redis for rate limiting (no fallback) | `false` |

## Hash Tags for Cluster Compatibility

Redis Cluster requires that all keys accessed in a Lua script must be in the same hash slot. The system automatically wraps keys with hash tags (`{key}`) to ensure compatibility:

- Single key operations: `mykey` → `{mykey}`
- API key cache: `apiKey:mykey` → `{apiKey:mykey}`
- Rate limiting: `rl:apikey` → `{rl:apikey}`

## Rate Limiting with Redis Cluster

### Leaky Bucket Algorithm

The system uses a GCRA (Generic Cell Rate Algorithm) leaky bucket implementation that works with both single Redis instances and Redis Cluster:

```typescript
// Consume from leaky bucket rate limiter
const result = await consumeLeakyBucket(key, capacity, windowMs);

if (result.allowed) {
  // Request is within rate limit
  console.log(`Remaining: ${result.remaining}`);
} else {
  // Rate limit exceeded
  console.log(`Retry after: ${result.retryAfterMs}ms`);
}
```

### Express Rate Limiting Middleware

The `RedisRateLimitStore` implements the `express-rate-limit` v6 store interface and works with Redis Cluster:

```typescript
const limiterStore = new RedisRateLimitStore(
  redisClient,
  Math.ceil(windowMs / 1000)
);

const limiter = rateLimit({
  windowMs,
  max: limit,
  store: limiterStore,
  // ... other options
});
```

## Error Handling and Fallback

### STATELESS_MODE

When `STATELESS_MODE=true`, Redis becomes mandatory for rate limiting. If Redis is unavailable, the server returns a 503 Service Unavailable error:

```bash
STATELESS_MODE=true
```

### Fallback Mode (Default)

When `STATELESS_MODE=false` (default) and Redis is unavailable:

1. Rate limiting falls back to in-memory storage
2. Each server instance maintains its own rate limit counters
3. This is suitable for single-instance deployments or development

## Monitoring and Logging

### Cluster Events

Redis Cluster events are logged for monitoring:

- `node error`: Errors on individual cluster nodes
- `+node`: Node added to cluster
- `-node`: Node removed from cluster

### Health Checks

Monitor Redis connectivity through:
- Application logs for Redis errors
- Health check endpoints
- Cluster node status

## Deployment Considerations

### Production Recommendations

1. **Use Redis Cluster** for multi-instance deployments
2. **Enable STATELESS_MODE** for consistent rate limiting
3. **Monitor cluster health** with proper alerting
4. **Set appropriate timeouts** for cluster operations

### Development Setup

For local development, a single Redis instance is sufficient:

```bash
# Docker Compose example
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

### Testing

Run Redis integration tests:

```bash
# Start test Redis instance
docker run -d -p 6379:6379 redis:7-alpine

# Run tests
TEST_REDIS=true npm test -- redis.integration.test.ts
```

## Migration from Single Redis to Cluster

1. Deploy Redis Cluster
2. Update environment variables to use `REDIS_CLUSTER_NODES`
3. Restart application servers
4. Verify rate limiting works correctly
5. Monitor for any issues with key distribution

## Troubleshooting

### Common Issues

1. **MOVED errors**: Ensure hash tags are used for keys in Lua scripts
2. **Cluster discovery failures**: Verify node addresses and network connectivity
3. **Script loading errors**: The system handles EVAL/EVALSHA fallback automatically

### Debugging

Enable debug logging for Redis operations:

```typescript
// Add to Redis client configuration
redisOptions: {
  enableOfflineQueue: true,
  retryStrategy: (times) => {
    console.log(`Redis retry attempt ${times}`);
    return Math.min(times * 50, 2000);
  }
}
```

## Performance Considerations

1. **Network latency**: Redis Cluster adds network overhead for cross-slot operations
2. **Script caching**: Lua scripts are cached with EVALSHA for better performance
3. **Connection pooling**: ioredis manages connections to all cluster nodes
4. **Read scaling**: Configure `scaleReads` to distribute read operations