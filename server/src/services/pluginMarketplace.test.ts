import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  _resetRegistry,
  getPlugin,
  isPipelineClear,
  listPlugins,
  registerPlugin,
  runPluginPipeline,
  unregisterPlugin,
  updatePlugin,
  type ValidationPlugin,
} from "./pluginMarketplace";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlugin(overrides: Partial<ValidationPlugin["metadata"]> = {}): ValidationPlugin {
  return {
    metadata: {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      author: "tester",
      description: "A test plugin",
      category: "validation",
      status: "active",
      priority: 100,
      config: {},
      ...overrides,
    },
    execute: vi.fn().mockResolvedValue({ blocked: false }),
  };
}

const baseCtx = {
  tenantId: "tenant-1",
  chainId: "stellar",
  addresses: ["GADDRESS1", "GADDRESS2"],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registerPlugin", () => {
  beforeEach(() => _resetRegistry());
  afterEach(() => _resetRegistry());

  it("registers a plugin and returns its metadata", () => {
    const meta = registerPlugin(makePlugin());
    expect(meta.id).toBe("test-plugin");
    expect(meta.installedAt).toBeInstanceOf(Date);
    expect(meta.updatedAt).toBeInstanceOf(Date);
  });

  it("sets default priority to 100 when not provided", () => {
    const p = makePlugin();
    (p.metadata as any).priority = undefined;
    const meta = registerPlugin(p);
    expect(meta.priority).toBe(100);
  });

  it("replaces existing plugin on re-registration and preserves installedAt", async () => {
    const first = registerPlugin(makePlugin({ version: "1.0.0" }));
    await new Promise((r) => setTimeout(r, 5));
    const second = registerPlugin(makePlugin({ version: "1.1.0" }));
    expect(second.installedAt).toEqual(first.installedAt);
    expect(second.version).toBe("1.1.0");
  });

  it("throws on invalid plugin id", () => {
    expect(() => registerPlugin(makePlugin({ id: "Invalid ID!" }))).toThrow(
      /Invalid plugin id/,
    );
  });

  it("throws on id starting with a dash", () => {
    expect(() => registerPlugin(makePlugin({ id: "-bad-start" }))).toThrow();
  });

  it("throws on id longer than 64 chars", () => {
    const longId = "a".repeat(65);
    expect(() => registerPlugin(makePlugin({ id: longId }))).toThrow();
  });
});

describe("unregisterPlugin", () => {
  beforeEach(() => _resetRegistry());
  afterEach(() => _resetRegistry());

  it("returns true when plugin existed and removes it", () => {
    registerPlugin(makePlugin());
    expect(unregisterPlugin("test-plugin")).toBe(true);
    expect(getPlugin("test-plugin")).toBeUndefined();
  });

  it("returns false when plugin did not exist", () => {
    expect(unregisterPlugin("nonexistent")).toBe(false);
  });
});

describe("listPlugins", () => {
  beforeEach(() => _resetRegistry());
  afterEach(() => _resetRegistry());

  it("returns all registered plugins sorted by priority", () => {
    registerPlugin(makePlugin({ id: "plugin-b", priority: 50 }));
    registerPlugin(makePlugin({ id: "plugin-a", priority: 10 }));
    registerPlugin(makePlugin({ id: "plugin-c", priority: 200 }));

    const ids = listPlugins().map((m) => m.id);
    expect(ids).toEqual(["plugin-a", "plugin-b", "plugin-c"]);
  });

  it("filters by category", () => {
    registerPlugin(makePlugin({ id: "val-plugin", category: "validation" }));
    registerPlugin(makePlugin({ id: "kyc-plugin", category: "kyc" }));

    const results = listPlugins({ category: "kyc" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("kyc-plugin");
  });

  it("filters by status", () => {
    registerPlugin(makePlugin({ id: "active-p", status: "active" }));
    registerPlugin(makePlugin({ id: "inactive-p", status: "inactive" }));

    const active = listPlugins({ status: "active" });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("active-p");
  });

  it("returns empty array when nothing registered", () => {
    expect(listPlugins()).toHaveLength(0);
  });
});

describe("getPlugin", () => {
  beforeEach(() => _resetRegistry());
  afterEach(() => _resetRegistry());

  it("returns metadata for a known plugin", () => {
    registerPlugin(makePlugin());
    expect(getPlugin("test-plugin")).toBeDefined();
  });

  it("returns undefined for unknown plugin", () => {
    expect(getPlugin("ghost")).toBeUndefined();
  });
});

describe("updatePlugin", () => {
  beforeEach(() => _resetRegistry());
  afterEach(() => _resetRegistry());

  it("updates config and status", () => {
    registerPlugin(makePlugin());
    const updated = updatePlugin("test-plugin", {
      status: "inactive",
      config: { key: "value" },
    });
    expect(updated.status).toBe("inactive");
    expect(updated.config).toEqual({ key: "value" });
  });

  it("throws when plugin is not registered", () => {
    expect(() => updatePlugin("ghost", { status: "inactive" })).toThrow(
      /not registered/,
    );
  });

  it("bumps updatedAt", async () => {
    const meta = registerPlugin(makePlugin());
    await new Promise((r) => setTimeout(r, 5));
    const updated = updatePlugin("test-plugin", { priority: 50 });
    expect(updated.updatedAt.getTime()).toBeGreaterThan(meta.updatedAt.getTime());
  });
});

describe("runPluginPipeline", () => {
  beforeEach(() => _resetRegistry());
  afterEach(() => _resetRegistry());

  it("returns empty array when no plugins registered", async () => {
    const results = await runPluginPipeline(baseCtx);
    expect(results).toHaveLength(0);
  });

  it("runs active plugins and collects results", async () => {
    registerPlugin(makePlugin({ id: "pass-plugin" }));
    const results = await runPluginPipeline(baseCtx);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].blocked).toBe(false);
    expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("skips inactive plugins", async () => {
    registerPlugin(makePlugin({ id: "inactive-plugin", status: "inactive" }));
    const results = await runPluginPipeline(baseCtx);
    expect(results).toHaveLength(0);
  });

  it("short-circuits on first block", async () => {
    const blockingPlugin = makePlugin({
      id: "blocker",
      priority: 10,
    });
    const execute = vi
      .fn()
      .mockResolvedValue({ blocked: true, blockedAddresses: ["GADDRESS1"], reason: "Sanctioned" });
    blockingPlugin.execute = execute;

    const afterPlugin = makePlugin({ id: "after", priority: 20 });
    const afterExecute = vi.fn().mockResolvedValue({ blocked: false });
    afterPlugin.execute = afterExecute;

    registerPlugin(blockingPlugin);
    registerPlugin(afterPlugin);

    const results = await runPluginPipeline(baseCtx);
    expect(results).toHaveLength(1);
    expect(results[0].blocked).toBe(true);
    expect(afterExecute).not.toHaveBeenCalled();
  });

  it("continues on plugin error (fail-open default)", async () => {
    vi.stubEnv("PLUGIN_FAIL_CLOSED", "false");

    const errorPlugin = makePlugin({ id: "error-plugin" });
    errorPlugin.execute = vi.fn().mockRejectedValue(new Error("boom"));
    registerPlugin(errorPlugin);

    const results = await runPluginPipeline(baseCtx);
    expect(results[0].passed).toBe(true);
    expect(results[0].blocked).toBe(false);

    vi.unstubAllEnvs();
  });

  it("blocks on plugin error when PLUGIN_FAIL_CLOSED=true", async () => {
    vi.stubEnv("PLUGIN_FAIL_CLOSED", "true");

    const errorPlugin = makePlugin({ id: "error-plugin" });
    errorPlugin.execute = vi.fn().mockRejectedValue(new Error("boom"));
    registerPlugin(errorPlugin);

    const results = await runPluginPipeline(baseCtx);
    expect(results[0].blocked).toBe(true);

    vi.unstubAllEnvs();
  });

  it("times out a plugin and treats it as an error", async () => {
    vi.useFakeTimers();
    vi.stubEnv("PLUGIN_TIMEOUT_MS", "50");

    const slowPlugin = makePlugin({ id: "slow-plugin" });
    slowPlugin.execute = vi
      .fn()
      .mockImplementation(() => new Promise((r) => setTimeout(r, 60_000)));
    registerPlugin(slowPlugin);

    // Start the pipeline; advance fake timers to trigger the timeout
    const pipelinePromise = runPluginPipeline(baseCtx);
    await vi.advanceTimersByTimeAsync(200);
    const results = await pipelinePromise;

    expect(results[0].passed).toBe(true); // fail-open by default
    expect(results[0].blocked).toBe(false);

    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("runs plugins in priority order", async () => {
    const order: string[] = [];

    for (const [id, priority] of [["c", 30], ["a", 10], ["b", 20]] as const) {
      const p = makePlugin({ id, priority });
      p.execute = vi.fn().mockImplementation(async () => {
        order.push(id);
        return { blocked: false };
      });
      registerPlugin(p);
    }

    await runPluginPipeline(baseCtx);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("collects blockedAddresses from a blocking plugin", async () => {
    const blocker = makePlugin({ id: "addr-blocker" });
    blocker.execute = vi.fn().mockResolvedValue({
      blocked: true,
      blockedAddresses: ["GADDRESS1"],
      reason: "Matched custom list",
    });
    registerPlugin(blocker);

    const results = await runPluginPipeline(baseCtx);
    expect(results[0].blockedAddresses).toContain("GADDRESS1");
    expect(results[0].reason).toBe("Matched custom list");
  });
});

describe("isPipelineClear", () => {
  beforeEach(() => _resetRegistry());
  afterEach(() => _resetRegistry());

  it("returns true when no plugins block", async () => {
    registerPlugin(makePlugin());
    expect(await isPipelineClear(baseCtx)).toBe(true);
  });

  it("returns false when a plugin blocks", async () => {
    const blocker = makePlugin();
    blocker.execute = vi.fn().mockResolvedValue({ blocked: true });
    registerPlugin(blocker);
    expect(await isPipelineClear(baseCtx)).toBe(false);
  });

  it("returns true when registry is empty", async () => {
    expect(await isPipelineClear(baseCtx)).toBe(true);
  });
});

describe("OFAC custom list plugin integration", () => {
  beforeEach(() => _resetRegistry());
  afterEach(() => _resetRegistry());

  it("blocks a sanctioned address via a custom OFAC plugin", async () => {
    const customList = new Set(["GBADSANCTIONED1234567"]);

    const ofacPlugin: ValidationPlugin = {
      metadata: {
        id: "ofac-custom-lists",
        name: "OFAC Custom Blocklist",
        version: "1.0.0",
        author: "compliance-team",
        description: "Custom OFAC SDN extension with internal blocklist",
        category: "validation",
        status: "active",
        priority: 1,
        config: {},
      },
      async execute(ctx) {
        const hits = ctx.addresses.filter((a) =>
          customList.has(a.toUpperCase()),
        );
        return {
          blocked: hits.length > 0,
          blockedAddresses: hits,
          reason: hits.length > 0 ? "Address on custom OFAC blocklist" : undefined,
        };
      },
    };

    registerPlugin(ofacPlugin);

    const safeCtx = { ...baseCtx, addresses: ["GSAFE123456789012345"] };
    expect(await isPipelineClear(safeCtx)).toBe(true);

    const blockedCtx = { ...baseCtx, addresses: ["GBADSANCTIONED1234567"] };
    expect(await isPipelineClear(blockedCtx)).toBe(false);

    const results = await runPluginPipeline(blockedCtx);
    expect(results[0].reason).toBe("Address on custom OFAC blocklist");
  });
});
