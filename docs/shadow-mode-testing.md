# Shadow-mode Testing ("No-sign" Mode)

Shadow-mode Testing allows developers and administrators to route real production or test traffic through the Fluid server's validation pipelines without submitting transactions to the live network or exposing signing keys.

## Features

1. **Full Logic Verification**:
   - The transaction passes through all checks: API key validation, daily quota usage checks, OFAC compliance screening, and SAR rules.
2. **Zero Network Cost**:
   - Bypasses cryptographic signing and Horizon network submission.
3. **No-downtime Simulation**:
   - Stores transaction records in the database with status `"SHADOW"` to isolate them from standard records.

## Usage

Enable shadow mode for a request by doing any of the following:

- **HTTP Header**: Add `x-shadow-mode: true` to the request headers.
- **Request Body**: Pass `"shadowMode": true` in the JSON request body.
- **Global Environment Override**: Set the environment variable `SHADOW_MODE=true` on the server.
