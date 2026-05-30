"""Example: request a fee-bump for a Stellar transaction using fluid-py.

This script demonstrates the typical integration with the stellar-sdk Python
library.  It builds a minimal XDR transaction, hands it to FluidClient, and
prints the fee-bumped envelope returned by the Fluid server.

Prerequisites
-------------
    pip install fluid-py stellar-sdk

Usage
-----
    # Against a local or staging Fluid server:
    FLUID_SERVER_URL=http://localhost:3000 python example_fee_bump.py

    # Or edit the constants below directly.
"""

from __future__ import annotations

import os
import sys

# ---------------------------------------------------------------------------
# Configuration — edit these or set the corresponding environment variables
# ---------------------------------------------------------------------------
FLUID_SERVER_URL: str = os.getenv("FLUID_SERVER_URL", "http://localhost:3000")
NETWORK_PASSPHRASE: str = os.getenv(
    "STELLAR_NETWORK_PASSPHRASE", "Test SDF Network ; September 2015"
)
SOURCE_SECRET: str = os.getenv(
    "STELLAR_SOURCE_SECRET",
    # Generated offline — safe for demo/testnet only, never use on mainnet
    "SALKKNYYA3DQHZGGPDJKVSVMMQ6MYEZNGVUUGVNP6RSPYTNFX57EWGAO",
)
DESTINATION_ACCOUNT: str = os.getenv(
    "STELLAR_DESTINATION",
    "GDPVBHACK36UGXVKSWIGDNUZD3FQYZE6U63TGVYDMJTGEQYM6TAAKO6O",
)
HORIZON_URL: str = os.getenv(
    "HORIZON_URL", "https://horizon-testnet.stellar.org"
)

# ---------------------------------------------------------------------------
# Build a minimal inner transaction with stellar-sdk
# ---------------------------------------------------------------------------
try:
    from stellar_sdk import (
        Account,
        Asset,
        Keypair,
        Network,
        TransactionBuilder,
    )
    HAS_STELLAR_SDK = True
except ImportError:
    HAS_STELLAR_SDK = False


def build_inner_xdr() -> str:
    """Build a minimal Stellar payment transaction and return its XDR.

    Built entirely offline (no Horizon account load required), so this
    works with any keypair — funded or not — for demo purposes.

    Returns:
        Base64-encoded XDR string for the signed inner transaction.
    """
    if not HAS_STELLAR_SDK:
        print(
            "stellar-sdk is not installed.  Falling back to a hard-coded XDR "
            "placeholder.\n"
            "Install it with:  pip install stellar-sdk",
            file=sys.stderr,
        )
        # Minimal XDR placeholder so the example still runs without stellar-sdk
        return (
            "AAAAAgAAAABexRErfVD8RgHqf8wZXbJiV1FPpqQdTmNYUA+HFVQ5UwAAAGQA"
            "AAABAAAAAAAAAAAAAAABAAAAAAAAAA=="
        )

    keypair = Keypair.from_secret(SOURCE_SECRET)
    # Build offline: stub Account with sequence 0 — no Horizon needed
    source_account = Account(keypair.public_key, 0)

    tx = (
        TransactionBuilder(
            source_account=source_account,
            network_passphrase=NETWORK_PASSPHRASE,
            base_fee=100,
        )
        .append_payment_op(
            destination=DESTINATION_ACCOUNT,
            asset=Asset.native(),
            amount="0.0000001",
        )
        .set_timeout(30)
        .build()
    )
    tx.sign(keypair)
    return tx.to_xdr()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    """Request a fee-bump and print the result."""
    from fluid_py import FluidClient, FluidClientConfig

    print(f"Fluid server : {FLUID_SERVER_URL}")
    print(f"Network      : {NETWORK_PASSPHRASE}\n")

    # 1. Build (or load) the inner transaction XDR
    print("Building inner transaction …")
    inner_xdr = build_inner_xdr()
    print(f"Inner XDR    : {inner_xdr[:60]}…\n")

    # 2. Create the FluidClient
    config = FluidClientConfig(
        server_url=FLUID_SERVER_URL,
        network_passphrase=NETWORK_PASSPHRASE,
        horizon_url=HORIZON_URL,
    )
    client = FluidClient(config)
    print(f"Client       : {client}\n")

    # 3. Request the fee-bump
    print("Requesting fee-bump …")
    response = client.request_fee_bump(inner_xdr, submit=False)

    # 4. Print results
    print("=== Fee-Bump Response ===")
    print(f"Status     : {response.status}")
    print(f"XDR        : {response.xdr[:60]}…")
    if response.hash:
        print(f"Hash       : {response.hash}")
    if response.fee_payer:
        print(f"Fee payer  : {response.fee_payer}")
    if response.submitted_via:
        print(f"Submitted  : {response.submitted_via}")

    print("\nSuccess! fee-bump envelope received from Fluid server.")


if __name__ == "__main__":
    main()
