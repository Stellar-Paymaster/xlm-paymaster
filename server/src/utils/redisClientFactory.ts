import Redis, { Cluster, ClusterOptions } from "ioredis";

export type RedisClient = Redis | Cluster;

export interface RedisClientConfig {
  url?: string;
  clusterNodes?: string[];
  clusterOptions?: ClusterOptions;
}

/**
 * Creates a Redis client based on configuration.
 * Supports both single Redis instance and Redis Cluster.
 * 
 * @param config Redis client configuration
 * @returns Redis client (single instance or cluster)
 */
export function createRedisClient(config: RedisClientConfig): RedisClient {
  const { url, clusterNodes, clusterOptions } = config;
  
  // If cluster nodes are specified, create a Redis Cluster client
  if (clusterNodes && clusterNodes.length > 0) {
    // Parse cluster nodes into host/port objects
    const nodes = clusterNodes.map(node => {
      // Parse Redis URL (redis://host:port or host:port format)
      let host = "localhost";
      let port = 6379;
      
      if (node.includes("://")) {
        // Format: redis://host:port
        const urlParts = node.split("://");
        const hostPort = urlParts[1].split(":");
        host = hostPort[0];
        port = hostPort[1] ? parseInt(hostPort[1]) : 6379;
      } else if (node.includes(":")) {
        // Format: host:port
        const hostPort = node.split(":");
        host = hostPort[0];
        port = hostPort[1] ? parseInt(hostPort[1]) : 6379;
      } else {
        // Format: host (default port)
        host = node;
      }
      
      return { host, port };
    });
    
    const options: ClusterOptions = {
      scaleReads: "slave",
      redisOptions: {
        // Enable retry on connection failure
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        // Enable auto-reconnect
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        // Common Redis options
        connectTimeout: 10000,
        keepAlive: 1000,
        lazyConnect: false,
      },
      slotsRefreshTimeout: 10000,
      clusterRetryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 5000);
        return delay;
      },
      ...clusterOptions,
    };
    
    return new Redis.Cluster(nodes, options);
  }
  
  // Otherwise, create a single Redis instance client
  const redisUrl = url || process.env.REDIS_URL || "redis://127.0.0.1:6379";
  return new Redis(redisUrl, {
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
    keepAlive: 1000,
  });
}

/**
 * Loads Redis configuration from environment variables.
 * 
 * Environment variables:
 * - REDIS_URL: Single Redis instance URL
 * - REDIS_CLUSTER_NODES: Comma-separated list of Redis cluster nodes
 * - REDIS_CLUSTER_OPTIONS: JSON string for additional cluster options
 * 
 * @returns RedisClientConfig
 */
export function loadRedisConfig(): RedisClientConfig {
  const url = process.env.REDIS_URL;
  const clusterNodes = process.env.REDIS_CLUSTER_NODES
    ? process.env.REDIS_CLUSTER_NODES.split(",").map(node => node.trim()).filter(node => node)
    : undefined;
  
  let clusterOptions: ClusterOptions | undefined;
  if (process.env.REDIS_CLUSTER_OPTIONS) {
    try {
      clusterOptions = JSON.parse(process.env.REDIS_CLUSTER_OPTIONS);
    } catch (error) {
      console.error("[Redis] Failed to parse REDIS_CLUSTER_OPTIONS:", error);
    }
  }
  
  return {
    url,
    clusterNodes,
    clusterOptions,
  };
}

/**
 * Creates a Redis client from environment variables.
 * 
 * @returns Redis client (single instance or cluster)
 */
export function createRedisClientFromEnv(): RedisClient {
  const config = loadRedisConfig();
  return createRedisClient(config);
}