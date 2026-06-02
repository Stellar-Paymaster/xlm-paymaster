import { describe, it, expect } from "vitest";
import { runCryptoBenchmark } from "../src/performance/cryptoBenchmark";

describe("Crypto Benchmark", () => {
  it("should successfully run benchmark and return valid results", async () => {
    const result = await runCryptoBenchmark(5);

    expect(result.nativeNodeMs).toBeGreaterThanOrEqual(0);
    expect(result.wasmMs).toBeGreaterThanOrEqual(0);
    expect(["WASM", "Native Node"]).toContain(result.winner);
  });
});
