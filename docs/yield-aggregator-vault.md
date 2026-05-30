# Yield Aggregator Vault Contract

The `YieldAggregatorVault` contract is designed as a gasless interface for interacting with Stellar liquidity pools. It enables users to deposit Stellar tokens to mint yield shares, withdraw assets by burning shares, and allows authorized administrators to reallocate (rebalance) funds to maximize yields across pools.

## Methods

### `initialize(env: Env, admin: Address)`
Initializes the contract owner.
- **admin**: The vault owner who can trigger rebalancing.

### `deposit(env: Env, user: Address, token: Address, amount: i128) -> i128`
Deposits tokens into the vault and mints corresponding shares.
- **user**: The depositor.
- **token**: Address of the token to deposit.
- **amount**: The token deposit amount.
- **Returns**: The number of shares minted.

### `withdraw(env: Env, user: Address, token: Address, share_amount: i128) -> i128`
Burns shares and withdraws the corresponding token value from the vault.
- **user**: The withdrawer.
- **token**: The asset token address.
- **share_amount**: The number of shares to burn.
- **Returns**: The token asset amount withdrawn.

### `rebalance(env: Env, from_pool: Address, to_pool: Address, token: Address, amount: i128)`
Triggers asset redistribution between different liquidity pool endpoints.
- **from_pool**: Source pool address.
- **to_pool**: Destination pool address.
- **token**: Address of the token being moved.
- **amount**: Amount to transfer.
