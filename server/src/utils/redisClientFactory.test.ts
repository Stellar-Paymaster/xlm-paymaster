import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Redis from "ioredis";
import { createRedisClient, loadRedisConfig, createRedisClientFromEnv } from "./redisClientFactory";

describe("redisClientFactory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("loadRedisConfig", () => {
    it("should load single Redis URL from environment", () => {
      process.env.REDIS_URL = "redis://localhost:6379";
      
      const config = loadRedisConfig();
      
      expect(config.url).toBe("redis://localhost:6379");
      expect(config.clusterNodes).toBeUndefined();
      expect(config.clusterOptions).toBeUndefined();
    });

    it("should load Redis Cluster nodes from environment", () => {
      process.env.REDIS_CLUSTER_NODES = "redis://node1:6379,redis://node2:6379,redis://node3:6379";
      
      const config = loadRedisConfig();
      
      expect(config.url).toBeUndefined();
      expect(config.clusterNodes).toEqual([
        "redis://node1:6379",
        "redis://node2:6379",
        "redis://node3:6379",
      ]);
    });

    it("should load Redis Cluster options from environment", () => {
      process.env.REDIS_CLUSTER_NODES = "redis://node1:6379,redis://node2:6379";
      process.env.REDIS_CLUSTER_OPTIONS = '{"scaleReads": "slave", "slotsRefreshTimeout": 5000}';
      
      const config = loadRedisConfig();
      
      expect(config.clusterNodes).toEqual([
        "redis://node1:6379",
        "redis://node2:6379",
      ]);
      expect(config.clusterOptions).toEqual({
        scaleReads: "slave",
        slotsRefreshTimeout: 5000,
      });
    });

    it("should handle invalid JSON in REDIS_CLUSTER_OPTIONS", () => {
      process.env.REDIS_CLUSTER_NODES = "redis://node1:6379";
      process.env.REDIS_CLUSTER_OPTIONS = "invalid json";
      
      const config = loadRedisConfig();
      
      expect(config.clusterNodes).toEqual(["redis://node1:6379"]);
      expect(config.clusterOptions).toBeUndefined();
    });

    it("should trim whitespace from cluster nodes", () => {
      process.env.REDIS_CLUSTER_NODES = "  redis://node1:6379 , redis://node2:6379  ";
      
      const config = loadRedisConfig();
      
      expect(config.clusterNodes).toEqual([
        "redis://node1:6379",
        "redis://node2:6379",
      ]);
    });

    it("should filter empty cluster nodes", () => {
      process.env.REDIS_CLUSTER_NODES = "redis://node1:6379,,redis://node2:6379,";
      
      const config = loadRedisConfig();
      
      expect(config.clusterNodes).toEqual([
        "redis://node1:6379",
        "redis://node2:6379",
      ]);
    });
  });

  describe("createRedisClient", () => {
    it("should create a single Redis instance when no cluster nodes are provided", () => {
      const client = createRedisClient({
        url: "redis://localhost:6380",
      });
      
      expect(client).toBeInstanceOf(Redis);
      expect((client as Redis).options.host).toBe("127.0.0.1");
      expect((client as Redis).options.port).toBe(6380);
    });

    it("should create a Redis Cluster when cluster nodes are provided", () => {
      const client = createRedisClient({
        clusterNodes: ["redis://node1:6379", "redis://node2:6379"],
      });
      
      expect(client).toBeInstanceOf(Redis.Cluster);
      expect((client as Redis.Cluster).nodes("master")).toHaveLength(2);
    });

    it("should use default URL when no configuration is provided", () => {
      const client = createRedisClient({});
      
      expect(client).toBeInstanceOf(Redis);
      expect((client as Redis).options.host).toBe("127.0.0.1");
      expect((client as Redis).options.port).toBe(6379);
    });

    it("should apply cluster options when provided", () => {
      const client = createRedisClient({
        clusterNodes: ["redis://node1:6379"],
        clusterOptions: {
          scaleReads: "slave",
          slotsRefreshTimeout: 10000,
        },
      });
      
      expect(client).toBeInstanceOf(Redis.Cluster);
    });
  });

  describe("createRedisClientFromEnv", () => {
    it("should create client from environment variables", () => {
      process.env.REDIS_URL = "redis://localhost:6380";
      
      const client = createRedisClientFromEnv();
      
      expect(client).toBeInstanceOf(Redis);
      expect((client as Redis).options.host).toBe("127.0.0.1");
      expect((client as Redis).options.port).toBe(6380);
    });

    it("should create cluster client from environment variables", () => {
      process.env.REDIS_CLUSTER_NODES = "redis://node1:6379,redis://node2:6379";
      
      const client = createRedisClientFromEnv();
      
      expect(client).toBeInstanceOf(Redis.Cluster);
    });

    it("should prefer cluster nodes over single URL", () => {
      process.env.REDIS_URL = "redis://localhost:6379";
      process.env.REDIS_CLUSTER_NODES = "redis://node1:6379";
      
      const client = createRedisClientFromEnv();
      
      expect(client).toBeInstanceOf(Redis.Cluster);
    });
  });
});