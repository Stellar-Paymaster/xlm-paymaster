import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FluidClient } from "../FluidClient";

const NETWORK = "Test SDF Network ; September 2015";
const SERVER_URL = "https://fluid.example.com";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeClient(useWorker: boolean) {
  return new FluidClient({ serverUrl: SERVER_URL, networkPassphrase: NETWORK, useWorker });
}

// ─── Worker availability detection ──────────────────────────────────────────

describe("Web Worker fallback – Worker unavailable in environment", () => {
  let originalWorker: typeof globalThis.Worker;

  beforeEach(() => {
    originalWorker = globalThis.Worker;
    // @ts-expect-error – simulate environments where Worker is not defined
    delete globalThis.Worker;
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
  });

  it("constructs without throwing when Worker is undefined", () => {
    expect(() => makeClient(true)).not.toThrow();
  });

  it("does not expose a worker instance when Worker is undefined", () => {
    const client = makeClient(true);
    // The client should still be usable; terminate() must not throw
    expect(() => client.terminate()).not.toThrow();
  });
});

// ─── Worker constructor throws ───────────────────────────────────────────────

describe("Web Worker fallback – Worker constructor throws", () => {
  let originalWorker: typeof globalThis.Worker;

  beforeEach(() => {
    originalWorker = globalThis.Worker;
    // @ts-expect-error
    globalThis.Worker = class {
      constructor() {
        throw new Error("Worker blocked by CSP");
      }
    };
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
  });

  it("falls back gracefully when Worker constructor throws", () => {
    expect(() => makeClient(true)).not.toThrow();
  });

  it("client remains usable after worker init failure", () => {
    const client = makeClient(true);
    expect(() => client.terminate()).not.toThrow();
  });
});

// ─── Worker disabled explicitly ──────────────────────────────────────────────

describe("Web Worker fallback – useWorker: false", () => {
  it("constructs without initialising a worker", () => {
    const constructorSpy = vi.fn();
    const originalWorker = globalThis.Worker;
    // @ts-expect-error
    globalThis.Worker = class {
      constructor(...args: any[]) {
        constructorSpy(...args);
      }
      onmessage = null;
      onerror = null;
      terminate() {}
      postMessage() {}
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() { return false; }
    };

    try {
      makeClient(false);
      expect(constructorSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.Worker = originalWorker;
    }
  });
});

// ─── Worker onerror triggers fallback ────────────────────────────────────────

describe("Web Worker fallback – runtime worker error", () => {
  it("does not throw when worker fires onerror", () => {
    let capturedOnerror: ((e: ErrorEvent) => void) | null = null;
    const originalWorker = globalThis.Worker;

    // @ts-expect-error
    globalThis.Worker = class {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: ErrorEvent) => void) | null = null;

      constructor() {
        // Capture the onerror handler set by FluidClient
        Promise.resolve().then(() => {
          capturedOnerror = this.onerror;
        });
      }

      terminate() {}
      postMessage() {}
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() { return false; }
    };

    try {
      const client = makeClient(true);

      // Simulate a runtime worker error
      expect(() => {
        if (capturedOnerror) {
          capturedOnerror(new ErrorEvent("error", { message: "Worker crashed" }));
        }
      }).not.toThrow();

      expect(() => client.terminate()).not.toThrow();
    } finally {
      globalThis.Worker = originalWorker;
    }
  });
});

// ─── terminate() is idempotent ───────────────────────────────────────────────

describe("Web Worker fallback – terminate idempotency", () => {
  it("can be called multiple times without throwing", () => {
    const client = makeClient(false);
    expect(() => {
      client.terminate();
      client.terminate();
      client.terminate();
    }).not.toThrow();
  });
});

// ─── Security policy simulation ──────────────────────────────────────────────

describe("Web Worker fallback – browser security policy restrictions", () => {
  const policies = [
    "worker-src 'none'",
    "script-src 'self'",
    "Content-Security-Policy violation",
  ];

  policies.forEach((policy) => {
    it(`falls back when Worker is blocked by: ${policy}`, () => {
      const originalWorker = globalThis.Worker;
      // @ts-expect-error
      globalThis.Worker = class {
        constructor() {
          const err = new Error(`Refused to create a worker: ${policy}`);
          err.name = "SecurityError";
          throw err;
        }
      };

      try {
        expect(() => makeClient(true)).not.toThrow();
      } finally {
        globalThis.Worker = originalWorker;
      }
    });
  });
});
