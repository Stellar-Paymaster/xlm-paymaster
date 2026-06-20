//! # fluid-core
//!
//! Core signing and transaction building logic for [Stellar Fluid](https://github.com/Stellar-Fluid/fluid).
//!
//! This crate provides the foundational types and operations for building and signing
//! Stellar fee-bump transactions. Fee-bump transactions allow a third party to pay
//! transaction fees on behalf of another account, enabling gasless transactions
//! and fee sponsorship.
//!
//! ## Quick Start
//!
//! ```no_run
//! use fluid_core::{TransactionBuilder, Ed25519Signer, Signer, Keypair};
//! use fluid_core::{NetworkPassphrase, FeeConfig};
//!
//! // Create a signer from a secret key (in practice, load from secure storage)
//! let keypair = Keypair::from_raw_keys([1u8; 32], [2u8; 32]);
//! let signer = Ed25519Signer::new(keypair);
//!
//! // Build a fee-bump transaction configuration
//! let config = FeeConfig::new(100, 2.0);
//! let network = NetworkPassphrase::testnet();
//! ```
//!
//! ## Feature Flags
//!
//! - `serde` - Enables serialization support for types using `serde`
//!
//! ## Modules
//!
//! - [`error`] - Error types and handling
//! - [`types`] - Core types (keys, signatures, fees)
//! - [`signer`] - Signing traits and implementations
//! - [`transaction_builder`] - Transaction building

#![warn(missing_docs)]
#![warn(rustdoc::broken_intra_doc_links)]

// Module declarations
pub mod error;
pub mod signer;
pub mod transaction_builder;
pub mod types;

// Re-exports for convenient access
pub use error::FluidError;

pub use signer::{
    AsyncSigner,
    Ed25519Signer,
    MultiSigner,
    Signer,
    TestSigner,
};

pub use transaction_builder::{
    compute_transaction_hash,
    parse_inner_tx,
    validate_not_fee_bump,
    FeeBumpTransaction,
    InnerTransaction,
    TransactionBuilder,
};

pub use types::{
    AccountId,
    DecoratedSignature,
    FeeConfig,
    FeePayerAccount,
    Keypair,
    NetworkPassphrase,
    PublicKey,
    SecretKey,
    TransactionHash,
};

// Re-export Zeroizing for users who need it
#[doc(hidden)]
pub use zeroize::Zeroizing;
