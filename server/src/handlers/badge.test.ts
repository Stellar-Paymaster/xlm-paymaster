import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { badgeHandler } from "./badge";
import type { Config } from "../config";

function makeReq(query: Record<string, string> = {}): Request {
  return { query } as unknown as Request;
}

function makeRes() {
  const headers: Record<string, string> = {};
  let body = "";
  return {
    setHeader: vi.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    send: vi.fn((b: string) => {
      body = b;
    }),
    _headers: headers,
    _body: () => body,
  };
}

function makeConfig(totalUses = 42): Config {
  return {
    signerPool: {
      getSnapshot: () => [
        { publicKey: "GABC", active: true, inFlight: 0, totalUses, balance: "100" },
        { publicKey: "GDEF", active: true, inFlight: 0, totalUses: 8, balance: "50" },
      ],
    },
  } as unknown as Config;
}

describe("badgeHandler", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns SVG with correct Content-Type", async () => {
    const req = makeReq();
    const res = makeRes();
    await badgeHandler(req as Request, res as unknown as Response, makeConfig());

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "image/svg+xml; charset=utf-8",
    );
    expect(res._body()).toContain("<svg");
    expect(res._body()).toContain("</svg>");
  });

  it("renders 'Powered by Paymaster' label", async () => {
    const req = makeReq();
    const res = makeRes();
    await badgeHandler(req as Request, res as unknown as Response, makeConfig());

    expect(res._body()).toContain("Powered by Paymaster");
  });

  it("includes tx stats by default", async () => {
    const req = makeReq();
    const res = makeRes();
    await badgeHandler(req as Request, res as unknown as Response, makeConfig(1500));

    // 42 + 8 = 50 from makeConfig default, but here totalUses=1500 per signer × 2 = 3000 → "3.0K"
    // Actually makeConfig passes totalUses only to first signer; second is hardcoded to 8
    // 1500 + 8 = 1508 → "1.5K"
    const body = res._body();
    expect(body).toMatch(/txs sponsored/);
  });

  it("omits stats when stats=false", async () => {
    const req = makeReq({ stats: "false" });
    const res = makeRes();
    await badgeHandler(req as Request, res as unknown as Response, makeConfig());

    expect(res._body()).not.toContain("txs sponsored");
  });

  it("applies dark style palette (dark background)", async () => {
    const req = makeReq({ style: "dark" });
    const res = makeRes();
    await badgeHandler(req as Request, res as unknown as Response, makeConfig());

    expect(res._body()).toContain("#0f172a"); // dark bg
    expect(res._body()).toContain("#38bdf8"); // dark logo fill
  });

  it("applies minimal style (transparent background)", async () => {
    const req = makeReq({ style: "minimal" });
    const res = makeRes();
    await badgeHandler(req as Request, res as unknown as Response, makeConfig());

    expect(res._body()).toContain("transparent");
  });

  it("defaults to light style for unknown style param", async () => {
    const req = makeReq({ style: "neon" });
    const res = makeRes();
    await badgeHandler(req as Request, res as unknown as Response, makeConfig());

    expect(res._body()).toContain("#ffffff"); // light bg
  });

  it("wraps badge in an anchor pointing to portal URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://paymaster.example.com");
    const req = makeReq({ stats: "false" });
    const res = makeRes();
    await badgeHandler(req as Request, res as unknown as Response, makeConfig());

    expect(res._body()).toContain('href="https://paymaster.example.com"');
  });

  it("falls back to paymaster.dev when NEXT_PUBLIC_SITE_URL is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const req = makeReq({ stats: "false" });
    const res = makeRes();
    await badgeHandler(req as Request, res as unknown as Response, makeConfig());

    expect(res._body()).toContain('href="https://paymaster.dev"');
  });

  it("sets short Cache-Control when stats are shown", async () => {
    const req = makeReq();
    const res = makeRes();
    await badgeHandler(req as Request, res as unknown as Response, makeConfig());

    expect(res._headers["Cache-Control"]).toContain("max-age=60");
  });

  it("sets long Cache-Control when stats are off", async () => {
    const req = makeReq({ stats: "false" });
    const res = makeRes();
    await badgeHandler(req as Request, res as unknown as Response, makeConfig());

    expect(res._headers["Cache-Control"]).toContain("max-age=86400");
  });

  it("formats large counts with K suffix", async () => {
    const req = makeReq();
    const res = makeRes();
    // 12000 + 8 = 12008 → "12.0K"
    await badgeHandler(req as Request, res as unknown as Response, makeConfig(12_000));

    expect(res._body()).toContain("K txs sponsored");
  });

  it("formats very large counts with M suffix", async () => {
    const req = makeReq();
    const res = makeRes();
    // 2_000_000 + 8 → "2.0M"
    await badgeHandler(req as Request, res as unknown as Response, makeConfig(2_000_000));

    expect(res._body()).toContain("M txs sponsored");
  });

  it("serves badge even when signerPool throws", async () => {
    const brokenConfig = {
      signerPool: {
        getSnapshot: () => {
          throw new Error("pool offline");
        },
      },
    } as unknown as Config;

    const req = makeReq();
    const res = makeRes();
    await badgeHandler(req as Request, res as unknown as Response, brokenConfig);

    // Should still return SVG without stats
    expect(res._body()).toContain("<svg");
    expect(res._body()).not.toContain("txs sponsored");
  });
});
