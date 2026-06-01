# Usage Forecasting Graph

**Status:** Implemented
**Scope:** `admin-dashboard/`
**Goal:** Predict when a tenant will run out of funds based on spend velocity, providing operators with actionable foresight.

## 1. Problem

Operators need to proactively manage tenant balances to prevent service interruptions due to depleted funds. Without forecasting, identifying tenants at risk requires manual calculation of spend velocity versus current balance.

## 2. Design

The `UsageForecastingGraph` component (`components/dashboard/UsageForecastingGraph.tsx`) visualizes historical balances and projects future balances until depletion.

### Key Logic
- **Spend Velocity:** Calculated as the average daily spend over the provided historical period.
- **Forecasting:** Projects the balance forward by subtracting the average daily spend for each future day.
- **Visual Distinction:** Uses a solid blue line for historical ("Actual") balance and a dashed gray line for the "Forecasted" future balance.
- **Depletion Warning:** Calculates the exact number of days until the forecasted balance hits $0 and displays it prominently in the header.

## 3. Integration

The component accepts the following props:
- `currentBalance` (number): The tenant's current available balance.
- `historicalData` (Array<{ date: string, spend: number }>): Daily spend data for the tenant.
- `tenantName` (string): The name of the tenant for display purposes.

It utilizes `recharts` for responsive, accessible data visualization.

## 4. Edge Cases Handled

1. **Empty Historical Data:** Displays a graceful fallback message instead of throwing errors or rendering an empty chart.
2. **Zero or Negative Spend Velocity:** Stops forecasting if average spend is $\le 0$, preventing infinite loops.
3. **Long Horizons:** Caps forecasting at 30 days into the future to maintain chart readability and prevent excessive memory usage.

## 5. Testing

Unit tests cover successful rendering with valid data, accurate depletion day calculations, graceful degradation on empty data arrays, and mocking of `ResponsiveContainer` to bypass limitations present in JSDOM.