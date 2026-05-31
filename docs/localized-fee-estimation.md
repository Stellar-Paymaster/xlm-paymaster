# Localized Fee Estimation

## How Congestion Multipliers Work

Fee estimation adjusts base fees based on regional network congestion patterns. Each region has three multipliers:

- **Low congestion**: Normal operating conditions
- **Medium congestion**: Moderate network load
- **High congestion**: Peak usage or degraded performance

### Multiplier Configuration

Default multipliers by region:

| Region | Low | Medium | High |
|--------|-----|--------|------|
| BR (Brazil) | 1.2x | 1.4x | 1.6x |
| EU (Europe) | 1.1x | 1.2x | 1.3x |
| APAC (Asia-Pacific) | 1.3x | 1.5x | 1.8x |
| US | 1.0x | 1.1x | 1.2x |

## How to Update Regional Config

Multipliers are configurable via environment variable:

```bash
# FLUID_CONGESTION_CONFIG must be valid JSON array
FLUID_CONGESTION_CONFIG='[{"region":"BR","low":1.3,"medium":1.5,"high":1.7}]'
```

Or create a config file:
```typescript
// src/fees/config/custom-config.ts
export const customConfig = [
  { region: "BR", low: 1.3, medium: 1.5, high: 1.7 }
];
```

## API Reference

### LocalizedFeeEstimator

```typescript
const estimator = new LocalizedFeeEstimator("BR", customConfig);
const result = estimator.estimate(100); // base fee in stroops

// Returns FeeEstimationResult:
// {
//   estimatedFee: 140,
//   currency: "XLM",
//   congestionLevel: "medium",
//   multiplier: 1.4
// }
```

### estimateFeeByRegion

Convenience function for one-off estimations:

```typescript
import { estimateFeeByRegion } from "@/fees/LocalizedFeeEstimator";

const result = estimateFeeByRegion("EU", 100);
```

## Edge Case Behavior

| Scenario | Behavior |
|----------|----------|
| Unknown region | Falls back to global average (1.1x) |
| Zero fee | Returns 0 estimated fee |
| Negative fee | Returns 0 estimated fee |
| Missing congestion config | Uses default values |
| Network failure (real-time) | Falls back to static config |

## FeeEstimationWidget Component

```tsx
import { FeeEstimationWidget } from "@/fees/components/FeeEstimationWidget";

<FeeEstimationWidget region="BR" baseFee={100} />
```

Props:
- `region` - Region code (required)
- `baseFee` - Base fee in stroops (default: 100)
- `onRegionChange` - Optional callback for region changes

Features:
- Real-time updates when region changes
- Congestion level badge with color coding
- Loading state indicator
- Error fallback display