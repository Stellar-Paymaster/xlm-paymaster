# Python SDK Parity Compliance Report

This report documents the alignment between the TypeScript SDK (`fluid-client`) and the Python SDK (`fluid-py`) following the parity update.

## Overview

The Fluid platform maintains multiple client libraries to support diverse developer ecosystems. This parity update ensures that core features, resilience patterns, and error handling are consistent across languages, allowing for a seamless developer experience when switching between TypeScript (frontend/Node.js) and Python (AI agents/backend).

## Key Parity Features

### 1. Robust Error Hierarchy
The TypeScript SDK now mirrors the Python SDK's error structure, making it easier to write cross-language error handling logic.

| TypeScript Class | Python Class | Description |
|------------------|--------------|-------------|
| `FluidError` | `FluidError` | Base class for all SDK errors. |
| `FluidRequestError` | `FluidRequestError` | Base class for network and server failures. |
| `FluidNetworkError` | `FluidNetworkError` | Thrown on DNS, connection, or timeout issues. |
| `FluidServerError` | `FluidServerError` | Thrown on 4xx/5xx responses from Fluid servers. |
| `FluidNoAvailableServerError` | `FluidNoAvailableServerError` | Thrown when all configured nodes are exhausted. |

### 2. Global Request Timeouts
Both SDKs now support a configurable global timeout for all server requests.

- **TS Configuration**: `new FluidClient({ timeout: 30 })` (seconds)
- **Python Configuration**: `FluidClientConfig(timeout=30.0)` (seconds)
- **Behavior**: Requests that exceed this duration are aborted and throw a `FluidNetworkError`.

### 3. URL Normalization & Failover
The normalization logic is now identical, ensuring that server selection and failover order are deterministic across platforms.

- **Deduplication**: Trailing slashes are stripped, and duplicate URLs are removed.
- **Order Preservation**: The initial order of `serverUrls` is preserved during deduplication, ensuring predictable primary/secondary node selection.
- **Cooling Down**: Both clients apply a 30-second cooldown to nodes that return 5xx errors or time out.

## Verification

Compliance has been verified via the following test suites:
- `client/test/parity.test.ts`: Verifies timeout enforcement, error class hierarchy, and URL normalization order.
- `fluid-py/tests/test_client.py`: Existing Python test suite used as the baseline for parity requirements.

## Future Parity Roadmap

The following features are slated for the next parity sync:
- [ ] **FluidMockClient**: Porting the TS mock utility to the Python SDK.
- [ ] **waitForConfirmation**: Porting the polling utility to the Python SDK.
- [ ] **buildSACTransferTx**: Porting Soroban SAC helper logic to the Python SDK.
