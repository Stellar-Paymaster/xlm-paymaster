# Cross-browser Compatibility Testing

**Issue:** #527 · Testing & QA  
**File:** `src/services/crossBrowserCompat.ts`

## Overview

The Fluid web client must support a broad range of browsers including Legacy Safari (≥ 11) and Firefox ESR (≥ 78). The `crossBrowserCompat` module provides:

1. **UA parsing** — lightweight, dependency-free parser that correctly handles Chrome/Edge/Opera disambiguation
2. **Compatibility checking** — configurable matrix of minimum versions per browser family
3. **Express middleware** — logs incompatible clients; optionally rejects them with 400
4. **Telemetry** — running counters for browser breakdown and compatibility rate

## Default compatibility matrix

| Browser | Minimum version | Notes |
|---|---|---|
| Chrome / Chromium | 90 | Shipped April 2021 |
| Firefox | 78 | ESR release, still widely deployed |
| Safari | 11 | Legacy Safari on macOS High Sierra |
| Edge (Chromium) | 90 | |
| Opera | 70 | |
| Internet Explorer | **All versions rejected** | Cannot run modern ES2020+/WASM |
| Unknown / bots | Allowed | API clients should not be blocked |

## Usage

### Attach the middleware globally

```typescript
import { crossBrowserCompatMiddleware } from "./services/crossBrowserCompat";

// Permissive mode — logs incompatible browsers but lets them through
app.use(crossBrowserCompatMiddleware());

// Strict mode — returns 400 for incompatible browsers
app.use(crossBrowserCompatMiddleware({ strict: true }));
```

### Custom matrix

```typescript
app.use(crossBrowserCompatMiddleware({
  strict: true,
  matrix: {
    allowUnknown: true,
    supported: [
      { family: "chrome",  minVersion: 100 },
      { family: "firefox", minVersion: 91  },  // Firefox ESR 91
      { family: "safari",  minVersion: 14  },
    ],
  },
}));
```

### Standalone UA check

```typescript
import { parseUserAgent, checkCompatibility } from "./services/crossBrowserCompat";

const ua = parseUserAgent(req.headers["user-agent"] ?? "");
const { compatible, reason } = checkCompatibility(ua);
```

### Telemetry

```typescript
import { getTelemetry } from "./services/crossBrowserCompat";

// Expose via admin analytics endpoint
app.get("/admin/browser-stats", (req, res) => {
  res.json(getTelemetry());
});
```

Sample telemetry response:

```json
{
  "total": 14823,
  "compatible": 14612,
  "incompatible": 211,
  "byFamily": {
    "chrome": 9412,
    "firefox": 3201,
    "safari": 1880,
    "edge": 204,
    "opera": 30,
    "ie": 96,
    "unknown": 0
  },
  "byVersion": {
    "chrome/120.0": 4100,
    "firefox/115.0": 2800,
    ...
  }
}
```

## UA parsing edge cases

The parser handles the following known disambiguation challenges:

| Situation | Solution |
|---|---|
| Chrome UA contains "Safari" token | Chrome matched first (specific `Chrome/` token) |
| Edge UA contains "Chrome" token | Edge matched first (specific `Edg/` token) |
| Opera UA contains "Chrome" token | Opera matched first (specific `OPR/` token) |
| IE 11 uses `rv:11.0` Trident format | Separate Trident regex for IE 11 |
| Bots / curl / server agents | Regex match on known bot patterns → `isBot: true` |
| No UA header | Returns `{ family: "unknown", isBot: false }` — allowed |

## Response format (strict mode, incompatible browser)

```json
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "browser_incompatible",
  "message": "safari 10 is below the minimum required version 11.",
  "browser": {
    "family": "safari",
    "version": "10.1"
  }
}
```

## Test coverage

The test file (`crossBrowserCompat.test.ts`) covers:

- UA parsing for all supported browser families with real-world UA strings
- Version boundary conditions (exactly at minimum, one below minimum)
- IE always rejected
- Bot / unknown UA handling
- Custom matrix constraints
- Telemetry accumulation and reset
- Middleware in permissive and strict modes
- Legacy Safari 11 accepted; Safari 10 rejected
- Firefox ESR 78 accepted; Firefox 52 rejected
- Missing User-Agent header handled gracefully
