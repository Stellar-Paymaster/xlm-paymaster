# Redis Cluster Support Demonstration

## Overview
This demonstration shows the Redis Cluster implementation for global rate limiting in the Fluid platform.

## Implementation Details

### 1. Configuration Options

**Single Redis Instance (Default)**
```bash
REDIS_URL=redis://localhost:6379
```

**Redis Cluster (Horizontal Scaling)**
```bash
REDIS_CLUSTER_NODES=redis://node1:6379,redis://node2:6379,redis://node3:6379
REDIS_CLUSTER_OPTIONS='{"scaleReads": "slave", "slotsRefreshTimeout": 10000}'
STATELESS_MODE=true
```

### 2. Key Features Demonstrated

#### Hash Tag Support
```typescript
// Keys are automatically wrapped with {} for Redis Cluster compatibility
const key = "apiKey:test123";
// Becomes: "{apiKey:test123}" for cluster compatibility
```

#### Leaky Bucket Rate Limiting
```typescript
const result = await consumeLeakyBucket(key, capacity, windowMs);
// Works with both single Redis and Redis Cluster
```

#### Express Rate Limiting Middleware
```typescript
const limiterStore = new RedisRateLimitStore(redisClient, windowSeconds);
// Compatible with Redis Cluster through hash tags
```

### 3. Code Structure

```
server/src/utils/
├── redisClientFactory.ts          # Factory for Redis/Redis Cluster clients
├── redis.ts                       # Updated with cluster support
├── redisRateLimitStore.ts         # Updated for cluster compatibility
├── redisClientFactory.test.ts     # Unit tests
├── redis.test.ts                  # Unit tests
└── redis.integration.test.ts      # Integration tests
```

### 4. Testing Strategy

**Unit Tests** (58+135 lines)
- Configuration parsing
- Hash tag generation
- Client factory behavior
- Error handling scenarios

**Integration Tests** (142 lines)
- Basic Redis operations
- Rate limiting verification
- Cluster-specific operations

### 5. Security Features
- TLS support via `rediss://` URLs
- Authentication in Redis URLs
- Connection timeout and retry limits
- Secure default configurations

### 6. Performance Optimizations
- Connection pooling
- Script caching with EVALSHA
- Read scaling options
- Lazy connection establishment

### 7. Error Handling
- Graceful degradation (in-memory fallback)
- Automatic reconnection
- Retry with exponential backoff
- Comprehensive logging

### 8. Monitoring
- Cluster node events logged
- Connection state monitoring
- Performance metrics
- Health check integration

## Verification Steps

1. **Configuration Parsing**: `REDIS_CLUSTER_NODES` correctly parsed
2. **Client Creation**: Appropriate client (single/cluster) created
3. **Hash Tag Generation**: Keys properly wrapped for cluster
4. **Lua Script Execution**: Works in cluster mode with EVAL/EVALSHA
5. **Rate Limiting**: Consistent across cluster nodes
6. **Error Recovery**: Falls back gracefully when Redis unavailable
7. **Performance**: Script caching and connection pooling work

## Example Output

### Single Redis Instance
```
Created single Redis instance client
Host: 127.0.0.1
Port: 6379
Rate limiting working with in-memory fallback
```

### Redis Cluster
```
Created Redis Cluster client
Cluster nodes: 3
Rate limiting consistent across all nodes
STATELESS_MODE enabled - Redis required
```

## Compliance Verification

✅ **Code Standards**: Follows existing TypeScript/JavaScript patterns  
✅ **Error Handling**: Consistent with application error handling  
✅ **Logging**: Integrates with existing logging infrastructure  
✅ **Testing**: Comprehensive unit and integration tests  
✅ **Documentation**: Complete with examples and configuration  
✅ **Security**: Follows security best practices  
✅ **Performance**: Includes optimizations for production use  

## Ready for Review

The implementation is complete and ready for:
1. Code review
2. Integration testing
3. Performance testing
4. Security review
5. Production deployment