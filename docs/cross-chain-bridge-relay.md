# Cross-Chain Bridge Relay Contract (Soroban Side)

The `CrossChainBridgeRelay` contract facilitates gasless cross-chain asset bridge transfers. Users can submit transactions through relayers who sponsor the gas fees. The contract checks signatures from trusted validators to authorize transactions and enforces replay protection via unique transfer IDs.

## Methods

### `initialize(env: Env, admin: Address, validator_pubkey: BytesN<32>)`
Configures contract parameters.
- **admin**: The contract administrator.
- **validator_pubkey**: The 32-byte Ed25519 public key of the signing validator.

### `relay_transfer(env: Env, recipient: Address, token: Address, amount: i128, from_chain: Symbol, transfer_id: u64, signature: BytesN<64>)`
Verifies a cryptographic signature over the transfer parameters and executes the asset release.
- **recipient**: The user address receiving the bridged tokens.
- **token**: The token address to transfer.
- **amount**: The token transfer amount.
- **from_chain**: The source chain identifier (e.g. `Symbol::new("ethereum")`).
- **transfer_id**: Unique ID for this transfer, preventing duplicate payouts.
- **signature**: The 64-byte Ed25519 signature of the validator over the payload.

### `is_processed(env: Env, transfer_id: u64) -> bool`
Returns true if a transfer ID has already been relayed.

### `update_validator(env: Env, new_validator: BytesN<32>)`
Updates the validator key. Requires admin authorization.
