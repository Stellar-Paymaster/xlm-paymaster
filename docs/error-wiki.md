# Fluid Error Wiki

Welcome to the central repository for Fluid SDK error codes. This guide helps you understand why an error occurred and how to resolve it. In addition to this static guide, you can use the interactive error lookup library in the client SDK or query them via the CLI.

## Interactive CLI Lookup

You can query, search, and list all Fluid API error codes directly from the command line:

```bash
# List all registered error codes
fluid errors --list

# Look up details for a specific code
fluid errors FLUID_001

# Search error codes by keyword (e.g. "limit" or "sequence")
fluid errors "rate limit" --search
```

---

## Central Error Code Registry

The following error codes are registered in the Fluid platform:

### `FLUID_001` - Invalid Transaction XDR
- **HTTP Status**: 400
- **Description**: The submitted transaction XDR could not be decoded or is malformed.
- **Common Causes**: wrong network passphrase during encoding, corrupted XDR string.
- **Remediation**: Re-build the transaction using the latest SDK and match the target network.

### `FLUID_002` - Fee Below Minimum
- **HTTP Status**: 400
- **Description**: The fee set on the inner transaction is below the Stellar network minimum (100 stroops).
- **Remediation**: Use `FluidClient.requestFeeBump()` which automatically handles compliance, or pass a baseFee ≥ 100.

### `FLUID_003` - Missing or Invalid API Key
- **HTTP Status**: 401
- **Description**: The request did not include a valid Fluid API key in the headers.

### `FLUID_004` - Tenant Quota Exceeded
- **HTTP Status**: 403
- **Description**: The tenant has exceeded their monthly fee-bump quota.

### `FLUID_005` - Transaction Not Found
- **HTTP Status**: 404
- **Description**: No transaction matching the supplied hash was found on the network.

### `FLUID_006` - Duplicate Transaction
- **HTTP Status**: 409
- **Description**: This transaction hash has already been processed by Fluid.

### `FLUID_007` - Rate Limit Exceeded
- **HTTP Status**: 429
- **Description**: Too many requests were made to the Fluid API in a short window.

### `FLUID_008` - Internal Server Error
- **HTTP Status**: 500
- **Description**: An unexpected error occurred on the Fluid server.

### `FLUID_009` - Stellar Network Unavailable
- **HTTP Status**: 503
- **Description**: The Fluid server could not reach the Stellar Horizon or Soroban RPC endpoint.

### `FLUID_010` - Invalid Soroban Contract Invocation
- **HTTP Status**: 400
- **Description**: The Soroban contract call included in the transaction is invalid or simulation failed.

---

## Need More Help?
If your error isn't listed here, please visit our [Discord Community](https://discord.gg/fluid) or open a [Support Ticket](https://support.fluid.dev/tickets).

