import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  DEFAULT_MATRIX,
  checkCompatibility,
  crossBrowserCompatMiddleware,
  getTelemetry,
  parseUserAgent,
  resetTelemetry,
  type CompatibilityMatrix,
} from "./crossBrowserCompat";

// ---------------------------------------------------------------------------
// Real-world UA strings for testing
// ---------------------------------------------------------------------------

const UAs = {
  chrome120:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  chrome89:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36",
  firefox115:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0",
  firefox78:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:78.0) Gecko/20100101 Firefox/78.0",
  firefox52:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:52.0) Gecko/20100101 Firefox/52.0",
  safari15:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 12_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15",
  safari10:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/10.1.2 Safari/604.1.38",
  safariLegacy11:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.1.2 Safari/605.1.15",
  edge120:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.71 Safari/537.36 Edg/120.0.2210.61",
  edge18Legacy:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763",
  opera80:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.71 Safari/537.36 OPR/80.0.4170.40",
  ie11:
    "Mozilla/5.0 (compatible; MSIE 11.0; Windows NT 6.1; Trident/7.0)",
  ie11Trident:
    "Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko",
  ie8:
    "Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.0; Trident/4.0)",
  curl:
    "curl/7.88.1",
  googlebot:
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  unknown:
    "CustomClient/1.0",
};

// ---------------------------------------------------------------------------
// parseUserAgent
// ---------------------------------------------------------------------------

describe("parseUserAgent", () => {
  it("parses Chrome 120", () => {
    const ua = parseUserAgent(UAs.chrome120);
    expect(ua.family).toBe("chrome");
    expect(ua.engine).toBe("blink");
    expect(ua.majorVersion).toBe(120);
    expect(ua.isBot).toBe(false);
  });

  it("parses Firefox ESR 78", () => {
    const ua = parseUserAgent(UAs.firefox78);
    expect(ua.family).toBe("firefox");
    expect(ua.engine).toBe("gecko");
    expect(ua.majorVersion).toBe(78);
  });

  it("parses Firefox 115", () => {
    const ua = parseUserAgent(UAs.firefox115);
    expect(ua.family).toBe("firefox");
    expect(ua.majorVersion).toBe(115);
  });

  it("parses Legacy Safari 11 (WebKit)", () => {
    const ua = parseUserAgent(UAs.safariLegacy11);
    expect(ua.family).toBe("safari");
    expect(ua.engine).toBe("webkit");
    expect(ua.majorVersion).toBe(11);
  });

  it("parses Safari 15", () => {
    const ua = parseUserAgent(UAs.safari15);
    expect(ua.family).toBe("safari");
    expect(ua.majorVersion).toBe(15);
  });

  it("parses Edge (Chromium) 120", () => {
    const ua = parseUserAgent(UAs.edge120);
    expect(ua.family).toBe("edge");
    expect(ua.engine).toBe("blink");
    expect(ua.majorVersion).toBe(120);
  });

  it("parses Legacy Edge 18", () => {
    const ua = parseUserAgent(UAs.edge18Legacy);
    expect(ua.family).toBe("edge");
    expect(ua.majorVersion).toBe(18);
  });

  it("parses Opera 80", () => {
    const ua = parseUserAgent(UAs.opera80);
    expect(ua.family).toBe("opera");
    expect(ua.engine).toBe("blink");
    expect(ua.majorVersion).toBe(80);
  });

  it("parses IE 11 (MSIE format)", () => {
    const ua = parseUserAgent(UAs.ie11);
    expect(ua.family).toBe("ie");
    expect(ua.engine).toBe("trident");
    expect(ua.majorVersion).toBe(11);
  });

  it("parses IE 11 (Trident rv: format)", () => {
    const ua = parseUserAgent(UAs.ie11Trident);
    expect(ua.family).toBe("ie");
    expect(ua.majorVersion).toBe(11);
  });

  it("detects curl as a bot", () => {
    const ua = parseUserAgent(UAs.curl);
    expect(ua.isBot).toBe(true);
  });

  it("detects Googlebot as a bot", () => {
    const ua = parseUserAgent(UAs.googlebot);
    expect(ua.isBot).toBe(true);
  });

  it("returns unknown for unrecognized UA strings", () => {
    const ua = parseUserAgent(UAs.unknown);
    expect(ua.family).toBe("unknown");
    expect(ua.majorVersion).toBe(-1);
  });

  it("handles empty UA string gracefully", () => {
    const ua = parseUserAgent("");
    expect(ua.family).toBe("unknown");
    expect(ua.isBot).toBe(false);
  });

  it("does not misidentify Chrome as Safari", () => {
    const ua = parseUserAgent(UAs.chrome120);
    expect(ua.family).toBe("chrome");
  });

  it("does not misidentify Edge as Chrome", () => {
    const ua = parseUserAgent(UAs.edge120);
    expect(ua.family).toBe("edge");
  });
});

// ---------------------------------------------------------------------------
// checkCompatibility
// ---------------------------------------------------------------------------

describe("checkCompatibility", () => {
  it("accepts Chrome 120 (above minimum)", () => {
    const ua = parseUserAgent(UAs.chrome120);
    const result = checkCompatibility(ua);
    expect(result.compatible).toBe(true);
  });

  it("rejects Chrome 89 (below minimum 90)", () => {
    const ua = parseUserAgent(UAs.chrome89);
    const result = checkCompatibility(ua);
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/89.*below/);
  });

  it("accepts Firefox ESR 78 (exactly at minimum)", () => {
    const ua = parseUserAgent(UAs.firefox78);
    const result = checkCompatibility(ua);
    expect(result.compatible).toBe(true);
  });

  it("rejects Firefox 52 (below minimum 78)", () => {
    const ua = parseUserAgent(UAs.firefox52);
    const result = checkCompatibility(ua);
    expect(result.compatible).toBe(false);
  });

  it("accepts Legacy Safari 11 (exactly at minimum)", () => {
    const ua = parseUserAgent(UAs.safariLegacy11);
    const result = checkCompatibility(ua);
    expect(result.compatible).toBe(true);
  });

  it("rejects Safari 10 (below minimum 11)", () => {
    const ua = parseUserAgent(UAs.safari10);
    const result = checkCompatibility(ua);
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/safari.*10.*below/i);
  });

  it("always rejects Internet Explorer", () => {
    const ua = parseUserAgent(UAs.ie11);
    const result = checkCompatibility(ua);
    expect(result.compatible).toBe(false);
    expect(result.reason).toMatch(/Internet Explorer/);
  });

  it("accepts bots regardless of UA", () => {
    const ua = parseUserAgent(UAs.curl);
    const result = checkCompatibility(ua);
    expect(result.compatible).toBe(true);
  });

  it("accepts unknown UA when allowUnknown=true", () => {
    const ua = parseUserAgent(UAs.unknown);
    const result = checkCompatibility(ua, { ...DEFAULT_MATRIX, allowUnknown: true });
    expect(result.compatible).toBe(true);
  });

  it("rejects unknown UA when allowUnknown=false", () => {
    const ua = parseUserAgent(UAs.unknown);
    const matrix: CompatibilityMatrix = {
      allowUnknown: false,
      supported: DEFAULT_MATRIX.supported,
    };
    const result = checkCompatibility(ua, matrix);
    expect(result.compatible).toBe(false);
  });

  it("uses custom matrix constraints", () => {
    const ua = parseUserAgent(UAs.chrome89);
    const laxMatrix: CompatibilityMatrix = {
      allowUnknown: true,
      supported: [{ family: "chrome", minVersion: 80 }],
    };
    expect(checkCompatibility(ua, laxMatrix).compatible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

describe("getTelemetry / resetTelemetry", () => {
  beforeEach(() => resetTelemetry());
  afterEach(() => resetTelemetry());

  it("counts total, compatible, and incompatible checks", () => {
    checkCompatibility(parseUserAgent(UAs.chrome120));       // compatible
    checkCompatibility(parseUserAgent(UAs.firefox52));       // incompatible
    checkCompatibility(parseUserAgent(UAs.safariLegacy11));  // compatible

    const t = getTelemetry();
    expect(t.total).toBe(3);
    expect(t.compatible).toBe(2);
    expect(t.incompatible).toBe(1);
  });

  it("tracks counts by family", () => {
    checkCompatibility(parseUserAgent(UAs.chrome120));
    checkCompatibility(parseUserAgent(UAs.chrome89));

    const t = getTelemetry();
    expect(t.byFamily.chrome).toBe(2);
  });

  it("resets all counters", () => {
    checkCompatibility(parseUserAgent(UAs.chrome120));
    resetTelemetry();
    const t = getTelemetry();
    expect(t.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

describe("crossBrowserCompatMiddleware", () => {
  beforeEach(() => resetTelemetry());
  afterEach(() => resetTelemetry());

  function makeReq(ua: string): Partial<Request> {
    return {
      headers: { "user-agent": ua },
      ip: "127.0.0.1",
      path: "/api/test",
    } as any;
  }

  function makeRes(): { status: any; json: any; statusCode?: number; body?: any } {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockImplementation((body: any) => {
      res.body = body;
      return res;
    });
    return res;
  }

  it("calls next() for a compatible browser (permissive mode)", () => {
    const middleware = crossBrowserCompatMiddleware();
    const req = makeReq(UAs.chrome120) as any;
    const res = makeRes() as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("calls next() even for an incompatible browser in permissive mode", () => {
    const middleware = crossBrowserCompatMiddleware({ strict: false });
    const req = makeReq(UAs.ie11) as any;
    const res = makeRes() as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 400 for incompatible browser in strict mode", () => {
    const middleware = crossBrowserCompatMiddleware({ strict: true });
    const req = makeReq(UAs.ie11) as any;
    const res = makeRes() as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toBe("browser_incompatible");
    expect(next).not.toHaveBeenCalled();
  });

  it("allows compatible browser through in strict mode", () => {
    const middleware = crossBrowserCompatMiddleware({ strict: true });
    const req = makeReq(UAs.firefox115) as any;
    const res = makeRes() as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("attaches parsed UA to req.browserUA", () => {
    const middleware = crossBrowserCompatMiddleware();
    const req = makeReq(UAs.chrome120) as any;
    const res = makeRes() as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect((req as any).browserUA).toBeDefined();
    expect((req as any).browserUA.family).toBe("chrome");
  });

  it("increments telemetry on each request", () => {
    const middleware = crossBrowserCompatMiddleware();
    const next = vi.fn();

    middleware(makeReq(UAs.chrome120) as any, makeRes() as any, next);
    middleware(makeReq(UAs.firefox78) as any, makeRes() as any, next);

    expect(getTelemetry().total).toBe(2);
    expect(getTelemetry().compatible).toBe(2);
  });

  it("handles missing User-Agent header gracefully", () => {
    const middleware = crossBrowserCompatMiddleware();
    const req = { headers: {}, ip: "127.0.0.1", path: "/" } as any;
    const res = makeRes() as any;
    const next = vi.fn();

    expect(() => middleware(req, res, next)).not.toThrow();
    expect(next).toHaveBeenCalled();
  });

  it("accepts Legacy Safari 11 in strict mode", () => {
    const middleware = crossBrowserCompatMiddleware({ strict: true });
    const req = makeReq(UAs.safariLegacy11) as any;
    const res = makeRes() as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("rejects Safari 10 in strict mode", () => {
    const middleware = crossBrowserCompatMiddleware({ strict: true });
    const req = makeReq(UAs.safari10) as any;
    const res = makeRes() as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
