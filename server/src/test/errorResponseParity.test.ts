import { describe, expect, it, vi } from "vitest";
import {
  captureErrorResponse,
  compareErrorParity,
  compareErrorResponses,
  normalizeErrorSnapshot,
  sortJson,
} from "./errorResponseParity";

describe("error response parity helpers", () => {
  it("sorts JSON objects recursively for stable comparisons", () => {
    expect(
      sortJson({
        z: 1,
        a: [{ d: true, b: "value" }],
      }),
    ).toEqual({
      a: [{ b: "value", d: true }],
      z: 1,
    });
  });

  it("normalizes content-type parameters and body key order", () => {
    expect(
      normalizeErrorSnapshot({
        body: { error: "Invalid API key.", code: "AUTH_FAILED" },
        contentType: "application/json; charset=utf-8",
        status: 403,
      }),
    ).toEqual({
      body: { code: "AUTH_FAILED", error: "Invalid API key." },
      contentType: "application/json",
      status: 403,
    });
  });

  it("reports no mismatches when status, content type, and JSON body match", () => {
    const result = compareErrorResponses(
      "invalid-api-key",
      {
        body: { error: "Invalid API key.", code: "AUTH_FAILED" },
        contentType: "application/json",
        status: 403,
      },
      {
        body: { code: "AUTH_FAILED", error: "Invalid API key." },
        contentType: "application/json; charset=utf-8",
        status: 403,
      },
    );

    expect(result.mismatches).toEqual([]);
  });

  it("reports field-level mismatches for parity failures", () => {
    const result = compareErrorResponses(
      "missing-api-key",
      {
        body: { code: "AUTH_FAILED", error: "API key required" },
        contentType: "application/json",
        status: 401,
      },
      {
        body: { code: "AUTH_FAILED", error: "Missing API key." },
        contentType: "text/plain",
        status: 403,
      },
    );

    expect(result.mismatches).toEqual([
      {
        caseName: "missing-api-key",
        field: "status",
        node: 401,
        rust: 403,
      },
      {
        caseName: "missing-api-key",
        field: "contentType",
        node: "application/json",
        rust: "text/plain",
      },
      {
        caseName: "missing-api-key",
        field: "body",
        node: { code: "AUTH_FAILED", error: "API key required" },
        rust: { code: "AUTH_FAILED", error: "Missing API key." },
      },
    ]);
  });

  it("captures non-JSON response bodies without throwing", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      headers: {
        get: vi.fn().mockReturnValue("text/plain"),
      },
      status: 500,
      text: vi.fn().mockResolvedValue("server exploded"),
    } as any);

    await expect(
      captureErrorResponse("http://node.local", {
        method: "GET",
        name: "plain-text-error",
        path: "/boom",
      }),
    ).resolves.toEqual({
      body: "server exploded",
      contentType: "text/plain",
      status: 500,
    });

    global.fetch = originalFetch;
  });

  it("compares every configured case against both servers", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      headers: {
        get: vi.fn().mockReturnValue("application/json"),
      },
      status: 404,
      text: vi.fn().mockResolvedValue(JSON.stringify({ code: "NOT_FOUND", error: "missing" })),
    } as any);

    const results = await compareErrorParity("http://node.local", "http://rust.local", [
      {
        method: "GET",
        name: "unknown-route",
        path: "/missing",
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].mismatches).toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    global.fetch = originalFetch;
  });
});
