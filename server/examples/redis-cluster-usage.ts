/**
 * Example usage of Redis Cluster support
 * 
 * This example demonstrates how to use the Redis Cluster features
 * in your application code.
 */

import { createRedisClientFromEnv } from '../src/utils/redisClientFactory';
import {
  getCachedApiKey,
  setCachedApiKey,
  invalidateApiKeyCache,
  incrWithExpiry,
  consumeLeakyBucket,
} from '../src/utils/redis';

async function exampleUsage() {
  console.log('=== Redis Cluster Usage Example ===\n');
  
  // 1. Create Redis client (automatically handles cluster or single instance)
  const redisClient = createRedisClientFromEnv();
  
  console.log('1. Created Redis client:', redisClient.constructor.name);
  
  // 2. API Key caching with cluster compatibility
  console.log('\n2. API Key Caching:');
  
  const apiKey = 'test-api-key-123';
  const apiKeyData = JSON.stringify({ tenantId: 'tenant-123', tier: 'premium' });
  
  // Set API key cache (automatically uses hash tags for cluster)
  await setCachedApiKey(apiKey, apiKeyData, 300);
  console.log(`   Set cache for API key: ${apiKey}`);
  
  // Get API key from cache
  const cached = await getCachedApiKey(apiKey);
  console.log(`   Retrieved from cache: ${cached ? 'Found' : 'Not found'}`);
  
  // Invalidate API key cache
  await invalidateApiKeyCache(apiKey);
  console.log(`   Invalidated cache for API key: ${apiKey}`);
  
  // 3. Rate limiting with leaky bucket algorithm
  console.log('\n3. Rate Limiting with Leaky Bucket:');
  
  const rateLimitKey = `tenant-123:endpoint:/api/v1/users`;
  const capacity = 10; // 10 requests
  const windowMs = 60000; // per minute
  
  // Simulate 12 requests (2 over limit)
  for (let i = 1; i <= 12; i++) {
    const result = await consumeLeakyBucket(rateLimitKey, capacity, windowMs);
    
    if (result) {
      console.log(`   Request ${i}: ${result.allowed ? 'Allowed' : 'Rejected'}`);
      console.log(`     Remaining: ${result.remaining}, Retry after: ${result.retryAfterMs}ms`);
    } else {
      console.log(`   Request ${i}: Redis error (using fallback)`);
    }
  }
  
  // 4. Simple increment with expiry (for simpler rate limiting)
  console.log('\n4. Simple Increment with Expiry:');
  
  const simpleKey = `ip:192.168.1.1:requests`;
  const result = await incrWithExpiry(simpleKey, 60); // 60 second window
  
  if (result) {
    console.log(`   Count: ${result.count}, TTL: ${result.ttl}s`);
  }
  
  // 5. Direct Redis operations with hash tags
  console.log('\n5. Direct Redis Operations:');
  
  // For direct operations, use ensureHashTag from redis.ts
  // or manually add {} for cluster compatibility
  const directKey = `session:user-123`;
  const clusterKey = `{${directKey}}`; // Manual hash tag
  
  await redisClient.set(clusterKey, 'session-data', 'EX', 3600);
  const sessionData = await redisClient.get(clusterKey);
  console.log(`   Session data: ${sessionData ? 'Stored' : 'Not found'}`);
  
  // 6. Cleanup
  console.log('\n6. Cleanup:');
  
  await redisClient.del(`{${rateLimitKey}}`);
  await redisClient.del(`{${simpleKey}}`);
  await redisClient.del(clusterKey);
  
  console.log('   Test keys cleaned up');
  
  // 7. Close connection
  await redisClient.quit();
  console.log('\n✅ Example completed successfully!');
}

// Environment setup for this example
// For single Redis instance:
//   REDIS_URL=redis://localhost:6379
//
// For Redis Cluster:
//   REDIS_CLUSTER_NODES=redis://node1:6379,redis://node2:6379,redis://node3:6379
//   STATELESS_MODE=true

if (require.main === module) {
  exampleUsage().catch(error => {
    console.error('Error in example:', error);
    process.exit(1);
  });
}

export { exampleUsage };