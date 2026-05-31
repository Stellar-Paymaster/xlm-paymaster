# CLI Transaction Simulator

The Fluid CLI includes a `simulate` command that allows you to test fee-sponsorship requests directly from your terminal. This is useful for debugging transaction XDRs and verifying configurations. With the latest update, you can run simulations both by communicating with a Fluid server, or completely offline locally using client-side checks.

## Usage

```bash
fluid simulate <INNER_TRANSACTION_XDR> [options]
```

### Options

- `<xdr>`: The base64-encoded inner transaction XDR you want to have fee-bumped.
- `-s, --server <url>`: The URL of the Fluid server (default: `http://localhost:3000`).
- `-n, --network <passphrase>`: The Stellar network passphrase (default: `Testnet`).
- `-j, --json`: Output the response as a JSON object (useful for CI/CD or scripting).
- `-l, --local`: Simulate locally offline without contacting the Fluid server.
- `-f, --fee-payer <public-key>`: Specify a custom fee payer public key for offline local simulation.
- `-b, --base-fee <fee>`: Specify base fee in stroops for offline local simulation (default: `100`).

## Examples

### Human-Readable Output (Server Simulation)

```bash
fluid simulate AAAA... --server https://fluid.testnet.dev
```

**Output:**
```
🔍 Simulating fee-bump for transaction...
   Server: https://fluid.testnet.dev
   Network: Test SDF Network ; September 2015

✅ Fee-bump simulation successful!
--------------------------------------------------
Status:      ready
Hash:        9b3...
Fee Payer:   GA...
Fee-Bump XDR:
AAAAA...
--------------------------------------------------

(Note: This transaction has NOT been submitted to the network)
```

### Local Offline Simulation

```bash
fluid simulate AAAA... --local --fee-payer GD... --base-fee 120
```

**Output:**
```
🔍 Simulating fee-bump locally (offline)...
──────────────────────────────────────────────────
✅  Simulation SUCCESSFUL
──────────────────────────────────────────────────
Inner Tx Hash : abcdef1234...
Fee Account   : GD...
Estimated Fee : 240 stroops
Network       : Test SDF Network ; September 2015
Fee-Bump XDR  :
AAAAA...
──────────────────────────────────────────────────
(NOT submitted to the network)
```

### JSON Output

```bash
fluid simulate AAAA... --json
```

**Output:**
```json
{
  "xdr": "AAAAA...",
  "status": "ready",
  "hash": "9b3...",
  "fee_payer": "GA..."
}
```

## Error Handling

The simulator provides detailed error messages for common failure scenarios:

- **Invalid XDR**: If the provided XDR is malformed or not a valid Stellar transaction.
- **Connection Failed**: If the Fluid server is unreachable.
- **Server Error (4xx/5xx)**: If the server rejects the request (e.g., rate limited, unauthorized, or internal error).

When using the `--json` flag, errors are also returned as JSON objects with the following structure:

```json
{
  "error": "Detailed error message",
  "type": "FluidServerError",
  "serverUrl": "http://localhost:3000",
  "statusCode": 403
}
```

## Resilience

The CLI uses the same `FluidClient` underlying the SDK, meaning it inherits:
- Automatic node failover if multiple servers are configured.
- Configurable request timeouts.
- Proper XDR serialization standards.

