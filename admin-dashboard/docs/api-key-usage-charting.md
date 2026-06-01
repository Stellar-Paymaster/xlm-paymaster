# Per-API-Key Usage Charting

Sub-graphs rendered inside `/admin/api-keys` that show per-key performance metrics: request counts, failure rates, and fee costs.

## Component

`components/dashboard/ApiKeyUsageCharts.tsx`

```tsx
import { ApiKeyUsageCharts } from "@/components/dashboard/ApiKeyUsageCharts";
import { buildApiKeyUsageStats } from "@/lib/api-key-usage-data";

const stats = buildApiKeyUsageStats(keys);
<ApiKeyUsageCharts stats={stats} />
```

## Charts rendered

| Chart | Metric | Purpose |
|-------|--------|---------|
| Requests per Key | `successCount` / `failedCount` | Spot keys driving disproportionate load |
| Failure Rate (%) | `failureRatePct` | Identify mis-configured or abusive keys |
| Cost per Key (stroops) | `totalCostStroops` | Track fee attribution per API key |

## Data source

`lib/api-key-usage-data.ts` exports `buildApiKeyUsageStats(keys)`. When a live analytics endpoint is not available, the function derives deterministic sample stats from key metadata (ID, active status, prefix). Once a `/admin/api-keys/usage` endpoint is available, replace the sample derivation with a real fetch inside `getApiKeysPageData()` and pass the returned stats directly.

## Tests

Unit tests (node:test):
```
node --test --experimental-strip-types lib/api-key-usage-data.test.ts
```

Component tests (vitest):
```
npx vitest run components/dashboard/ApiKeyUsageCharts.test.tsx
```
