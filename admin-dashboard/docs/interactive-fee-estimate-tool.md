# Interactive Fee Estimate Tool

## Overview

The Interactive Fee Estimate Tool enables platform operators to simulate and calculate the estimated transaction costs for Soroban smart contract invocations. Given the complexity of Stellar's resource-based fee model, this dashboard widget allows users to experiment with different parameters to forecast required fee bumps and maximum bid amounts.

## Features

1. **Resource Simulation**: Adjust CPU instructions, read bytes, and write bytes to gauge their impact on the overall resource fee.
2. **Surge Pricing (Fee Bump) Support**: Apply a multiplier to simulate high-congestion network states where fee bumps are necessary to ensure inclusion.
3. **Real-time Calculation**: Instantaneous feedback converting raw stroops to the final XLM equivalent.
4. **Accessible Design**: 
   - Built to align with system dark mode and high-contrast theme tokens.
   - Includes semantic ARIA labels for screen reader compatibility.

## Implementation Details

- **Path**: `admin-dashboard/src/components/dashboard/InteractiveFeeEstimateTool.tsx`
- **Heuristic Formulas**: The tool uses a heuristic linear model to emulate Soroban resource pricing for estimation purposes:
  - CPU Instructions: `cost = instructions * 0.0001`
  - Read Bytes: `cost = bytes * 0.1`
  - Write Bytes: `cost = bytes * 0.5`
- **Resilience**: Invalid or alphanumeric inputs are safely normalized to 0 using React's controlled state handlers, preventing `NaN` exceptions in the rendering phase.

## Security & Privacy

- All calculations occur strictly client-side via React `useMemo` hooks.
- No sensitive transaction details, private keys, or actual payloads are exposed or transmitted by this tool.
- Serves entirely as an exploratory simulation layer.