# Soroban Escrow Factory

Deploys unique escrow accounts for gasless atomic swaps.

## Features
- **Deterministic Deployment**: Uses salts to deploy unique escrow instances.
- **Atomic Swaps**: Supports secure, trustless exchanges of two different tokens.
- **Initialization in One Step**: Factory initializes the escrow contract immediately upon deployment.

## Interface
- `initialize(env, admin: Address, wasm_hash: BytesN<32>)`: Set up the factory with the escrow template WASM.
- `deploy_escrow(env, salt: BytesN<32>, initiator, counterparty, token_a, amount_a, token_b, amount_b)`: Deploy a new escrow.
