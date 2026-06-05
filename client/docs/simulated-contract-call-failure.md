# Simulated Contract Call Failure Demos

**Issue:** #733  
**Package:** `client`

## Overview

Transactions that will fail during a Soroban contract dry-run should be rejected *before* a fee-bump is requested, preventing unnecessary fee expenditure.

## Files

| File | Purpose |
|---|---|
| `client/src/sandbox/contractCallFailure.ts` | `assertDryRunSuccess` guard + `ContractCallFailureError` |
| `client/src/sandbox/contractCallFailure.test.ts` | Unit + integration tests |

## API

```typescript
import { assertDryRunSuccess, ContractCallFailureError } from './sandbox/contractCallFailure';

// Throws ContractCallFailureError if the dry-run does not succeed
await assertDryRunSuccess(simulator, signedXdr);

// Then safe to fee-bump
const result = await fluidClient.requestFeeBump(signedXdr);
```

## Test Scenarios

- Success path resolves without throwing
- `status: "failed"` throws `ContractCallFailureError` with reason
- `status: "malformed"` throws `ContractCallFailureError`
- Error message includes `errorCode` when present
- Fee-bump is never called when dry-run fails
- Simulator network errors propagate unwrapped
- Empty XDR string handled without crash

## Running Tests

```bash
cd client
npx vitest run src/sandbox/contractCallFailure.test.ts
```
