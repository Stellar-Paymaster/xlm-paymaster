# Flash Loan Provider Integration

A Soroban smart contract providing a flash loan facility with fee sponsorship. Borrowers can take loans of the pool's token, perform Arbitrage/executions, and repay the loan with fee in the same transaction.

## Features

- **Fee Sponsorship**: Administrators can configure the fee in basis points (BPS).
- **Re-entrancy Guard**: The contract prevents nested flash loan invocations.
- **Liquidity Checks**: Validates that the pool has enough tokens before issuing the loan.

## Contract Interface

### `initialize`
Initializes the flash loan contract configuration.
- `admin: Address` - Owner/admin of the contract.
- `token: Address` - Token that the pool handles.
- `fee_bps: u32` - Fee in basis points (e.g., 30 = 0.3%).

### `flash_loan`
Requests a flash loan.
- `borrower: Address` - Address of the borrowing contract.
- `amount: i128` - Amount to borrow.

### `set_fee`
Updates the pool fee (Admin only).
- `caller: Address` - Address executing the update.
- `new_fee_bps: u32` - New fee in basis points.

### `get_config`
Returns the current `FlashLoanConfig`.

### `get_balance`
Returns the current token balance of the pool.

### `compute_due`
Computes the repayment amount (principal + fee) for a given loan amount.
