# Streaming Payments Smart Contract

This document specifies the design, mechanics, and integration details of the Sablier-style money streaming contract implemented for the Fluid platform.

## Design Goals
1. **Trustless Custody**: Funds are locked inside the contract during the stream duration and can only be accessed as they vest.
2. **Linear Vesting**: Tokens are streamed second-by-second at a constant rate between the start time and the stop time.
3. **Gasless Compatibility**: Fully compatible with Fluid's relayer for gasless invocation using Stellar's fee-bump transactions.

## Contract Interface

### `create_stream`
Creates a stream from `sender` to `recipient` using a specific `token` (Stellar Asset Contract address).
* **Arguments**:
  - `sender: Address` (requires authorization)
  - `recipient: Address`
  - `token: Address`
  - `amount: i128` (must be positive)
  - `start_time: u64`
  - `stop_time: u64` (must be > `start_time`)
* **Returns**: `stream_id: u32`

### `withdraw`
Pulls accrued tokens out of the stream.
* **Arguments**:
  - `stream_id: u32`
  - `amount: i128` (must be positive and <= withdrawable amount)
* **Authorizer**: `recipient`

### `cancel_stream`
Terminates a stream. Payouts are split atomically:
- Recipient receives all accrued, unclaimed tokens up to the cancellation timestamp.
- Sender is refunded the remaining unstreamed tokens.
* **Arguments**:
  - `stream_id: u32`
* **Authorizer**: `sender`

### `withdrawable_amount`
Helper to query the current unclaimed accrued amount.
* **Arguments**:
  - `stream_id: u32`
* **Returns**: `i128`

## Mathematical Formulations

Given:
* $A$ = Total stream amount
* $T_{start}$ = Stream start timestamp
* $T_{stop}$ = Stream stop timestamp
* $T_{now}$ = Current ledger timestamp
* $W$ = Already withdrawn amount

The streamed amount $S(T_{now})$ at current time is defined as:
* If $T_{now} \ge T_{stop}$: $S(T_{now}) = A$
* If $T_{now} \le T_{start}$: $S(T_{now}) = 0$
* If $T_{start} < T_{now} < T_{stop}$:
$$S(T_{now}) = \frac{A \times (T_{now} - T_{start})}{T_{stop} - T_{start}}$$

The withdrawable amount is:
$$Withdrawable(T_{now}) = S(T_{now}) - W$$
