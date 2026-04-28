# Multi-Asset Staking Contract

Allows users to stake various Stellar assets to earn sponsorship credits.

## Features
- **Flexible Staking**: Stake any supported token.
- **Credit Accumulation**: Earn credits over time based on the amount staked.
- **Partial Unstaking**: Withdraw your stake at any time while keeping your accumulated credits.

## Interface
- `stake(env, staker: Address, token: Address, amount: i128)`: Add to your stake.
- `unstake(env, staker: Address, token: Address, amount: i128)`: Withdraw from your stake.
- `get_credits(env, staker: Address)`: Check your current credit balance.
