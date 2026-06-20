# fluid-core

[![Crates.io](https://img.shields.io/crates/v/fluid-core)](https://crates.io/crates/fluid-core)
[![Documentation](https://docs.rs/fluid-core/badge.svg)](https://docs.rs/fluid-core)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE)

Core signing and transaction building logic for [Stellar Fluid](https://github.com/Stellar-Fluid/fluid) - a fee sponsorship protocol for the Stellar network.

## Overview

`fluid-core` provides the foundational types and operations for building and signing Stellar fee-bump transactions. Fee-bump transactions allow a third party (the fee payer) to pay transaction fees on behalf of another account, enabling:

- **Gasless transactions** for end users
- **Fee sponsorship** by applications or services
- **Smart wallet** implementations
- **Account abstraction** patterns

## Quick Start

Add `fluid-core` to your `Cargo.toml`:

```toml
[dependencies]
fluid-core = "0.1.0"
```

### Basic Usage

```rust
use fluid_core::{TransactionBuilder, Ed25519Signer, Signer, Keypair};
use fluid_core::{NetworkPassphrase, PublicKey, TransactionHash, DecoratedSignature};

// Create a signer from a keypair
let keypair = Keypair::from_raw_keys([1u8; 32], [2u8; 32]);
let signer = Ed25519Signer::new(keypair);

// Build a fee-bump transaction
let fee_bump_tx = TransactionBuilder::new()
    .base_fee(100)
    .fee_multiplier(2.0)
    .network_passphrase(NetworkPassphrase::testnet())
    .fee_payer(PublicKey::new([2u8; 32]))
    .inner_hash(TransactionHash::new([0xaa; 32]))
    .add_signature(DecoratedSignature::new([0x12; 4], [0x34; 64]))
    .build(&signer, 3)?; // 3 operations in inner transaction
```

## Features

- **Signer Trait**: Pluggable signing backend - implement for HSM, KMS, passkey, etc.
- **Transaction Builder**: Fluent API for constructing fee-bump transactions
- **Secure Memory**: Automatic zeroization of secret keys using `zeroize`
- **Async Support**: Built-in support for async signing operations
- **Error Handling**: Comprehensive error types with `thiserror`

## Core Types

### Signers

- [`Ed25519Signer`](https://docs.rs/fluid-core/latest/fluid_core/struct.Ed25519Signer.html) - In-memory Ed25519 signing
- [`AsyncSigner`](https://docs.rs/fluid-core/latest/fluid_core/struct.AsyncSigner.html) - Async signing backend
- [`TestSigner`](https://docs.rs/fluid-core/latest/fluid_core/struct.TestSigner.html) - Testing only (insecure)

Implement the [`Signer`](https://docs.rs/fluid-core/latest/fluid_core/trait.Signer.html) trait for custom backends:

```rust
use fluid_core::{Signer, TransactionHash, DecoratedSignature, PublicKey, FluidError};

struct MyHsmSigner { /* ... */ }

impl Signer for MyHsmSigner {
    fn public_key(&self) -> &PublicKey { /* ... */ }
    fn sign_hash(&self, hash: &TransactionHash) -> Result<DecoratedSignature, FluidError> { /* ... */ }
    fn sign_payload(&self, payload: &[u8]) -> Result<[u8; 64], FluidError> { /* ... */ }
}
```

### Transaction Building

```rust
use fluid_core::{TransactionBuilder, FeeConfig, NetworkPassphrase};

// Configure fees
let config = FeeConfig::new(100, 2.0); // base_fee=100, multiplier=2.0x
let fee = config.calculate_fee(3); // 800 stroops for 3 operations

// Build with builder pattern
let builder = TransactionBuilder::new()
    .base_fee(100)
    .fee_multiplier(2.0)
    .network_passphrase(NetworkPassphrase::mainnet());
```

### Networks

- `NetworkPassphrase::testnet()` - Stellar testnet
- `NetworkPassphrase::mainnet()` - Stellar mainnet
- `NetworkPassphrase::futurenet()` - Stellar futurenet

## Examples

Run examples with `cargo run --example <name>`:

### Basic Signing

```bash
cargo run --example basic_signing
```

Demonstrates: creating signers, configuring transactions, fee calculation.

### Custom Signer

```bash
cargo run --example custom_signer
```

Demonstrates: implementing the `Signer` trait for HSM and remote signing backends.

### Transaction Builder

```bash
cargo run --example transaction_builder
```

Demonstrates: full builder API, multiple signatures, error handling.

## Security

- **Secret keys** are stored in `Zeroizing` wrappers that automatically clear memory on drop
- **No panics** - all errors are returned as `Result<T, FluidError>`
- **TestSigner** is marked as insecure for testing only

## Error Handling

All operations return `Result<T, FluidError>`:

```rust
use fluid_core::FluidError;

match result {
    Err(FluidError::InvalidTransaction(msg)) => println!("Invalid: {}", msg),
    Err(FluidError::SigningFailed(msg)) => println!("Signing failed: {}", msg),
    Err(FluidError::AlreadyFeeBumped) => println!("Already fee-bumped!"),
    _ => {}
}
```

## Integration

This crate is designed to integrate with:

- **Stellar Horizon** - for transaction submission
- **Soroban SDK** - for smart contract interactions
- **HSM/KMS services** - via custom `Signer` implementations

## License

Licensed under either of:

- [MIT License](../LICENSE-MIT) (or <http://opensource.org/licenses/MIT>)
- [Apache License, Version 2.0](../LICENSE-APACHE) (or <http://www.apache.org/licenses/LICENSE-2.0>)

at your option.

## Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions.

## See Also

- [Stellar Fluid](https://github.com/Stellar-Fluid/fluid) - The complete fee sponsorship protocol
- [Stellar SDK Documentation](https://soroban.stellar.org/)
- [Stellar Fee Bump Transactions](https://developers.stellar.org/docs/learn/encyclopedia/transactions-specialized/fee-bump-transactions)
