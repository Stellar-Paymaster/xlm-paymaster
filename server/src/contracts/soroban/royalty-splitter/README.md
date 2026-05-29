# NFT Royalty Splitter Contract

Automatically splits token payments (royalties) among a set of pre-defined recipients based on basis points.

## Features
- **Configurable Recipients**: Set up multiple recipients with specific percentages (basis points).
- **Dust Handling**: Ensures the full amount is distributed by adding any rounding dust to the last recipient.
- **Support for Any Token**: Works with any token implementing the Soroban Token interface.

## Interface
- `initialize(env, recipients: Vec<Recipient>)`: Setup recipients. Total BPS must be 10,000.
- `split(env, sender: Address, token: Address, amount: i128)`: Performs the split.
- `get_recipients(env)`: Returns the current list of recipients.
