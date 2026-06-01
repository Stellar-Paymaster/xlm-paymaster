# Vault Local Integration Guide

This guide explains how to enable HashiCorp Vault for storing the fee payer secret used by Fluid's server.

Prerequisites

- A running Vault server (dev or production).
- A secret stored in Vault (KV v2) at `secret/data/fluid/fee_payer` or custom path.

Environment variables

- `VAULT_ENABLED=true` — enable Vault usage.
- `VAULT_ADDR` — base URL for Vault, e.g. `http://127.0.0.1:8200`.
- `VAULT_TOKEN` — a Vault token with access to the secret path.
- `VAULT_SECRET_PATH` — optional custom path (defaults to `secret/data/fluid/fee_payer`).
- `VAULT_TOKEN_RENEW_SECONDS` — optional token renewal frequency in seconds (default 300).

Vault secret format

- KV v2 recommended. The secret object should contain `FLUID_FEE_PAYER_SECRET` or any key whose value is the raw secret string.

Local dev example (using `vault` CLI)

1. Start a dev Vault (for testing only):

```bash
export VAULT_ADDR=http://127.0.0.1:8200
vault server -dev -dev-root-token-id="root"
```

2. Write a secret (KV v2 namespace `secret/`):

```bash
vault kv put secret/fluid/fee_payer FLUID_FEE_PAYER_SECRET="SOME_PRIVATE_KEY"
```

3. Run the server with Vault enabled:

```bash
export VAULT_ENABLED=true
export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=root
# optional: export VAULT_SECRET_PATH=secret/data/fluid/fee_payer
cd fluid-server
cargo run --release
```

Notes & security

- The implementation never prints secrets to logs. Ensure your logging configuration does not include environment dumps.
- For production, prefer AppRole or Kubernetes auth over static tokens — the code can be extended to support these flows.
- Token renewal runs in the background and will attempt to renew the token periodically; failures are logged at debug/error level without printing the token.

If you need sample terminal output or screenshots, run the `cargo run` step above and capture the console output showing the server starting without printing secrets.
