# Public Status Page

## Component Architecture

The status page provides real-time health monitoring for all regions:

```
src/status/
├── components/
│   ├── StatusPage.tsx           # Main status grid component
│   └── StatusHistoryTimeline.tsx  # 90-day history timeline
├── hooks/
│   └── useRegionHealth.ts       # Health data fetching hook
├── types.ts                     # TypeScript interfaces
└── __tests__/                   # Unit and integration tests
```

## API Contract

The status API endpoint should return:

```typescript
interface StatusApiResponse {
  regions: RegionStatus[];
  timestamp: string;
  overall: HealthStatus;
}

interface RegionStatus {
  region: string;      // Code: US, EU, BR, APAC
  name: string;        // Human-readable: "United States", "Europe"
  status: HealthStatus; // operational | degraded | outage
  latencyMs: number;   // Latency in milliseconds
  uptimePercent: number; // 30-day uptime percentage
  lastChecked: string; // ISO timestamp
}
```

## Environment Variables

- `STATUS_API_URL` - URL of the status API endpoint
  - If not configured, the hook returns an error state

## Status Indicators

| Status | Color | Description |
|--------|-------|-------------|
| Operational | Green | All systems functioning normally |
| Degraded | Yellow | Partial service degradation |
| Outage | Red | Service unavailable |

## useRegionHealth Hook

```typescript
const { regions, loading, error, refetch } = useRegionHealth(30000);
```

Parameters:
- `refreshInterval` - Auto-refresh interval in ms (default: 30000)

Returns:
- `regions` - Array of RegionStatus
- `loading` - Boolean loading state
- `error` - Error message string or null
- `refetch` - Manual refresh function

## Edge Cases Handling

1. **API Timeout**: Request aborts after 10 seconds
2. **Partial Data**: Displays available regions, handles missing gracefully
3. **Network Offline**: Shows error state with retry option
4. **All Regions Down**: Displays outage for all visible regions

## Deployment Notes

- Status page can be served from a subdomain (e.g., `status.fluid.network`)
- For static hosting, use the `fetch` endpoint to proxy status API
- Timeline component renders last 30 days compressed to 30 columns for readability