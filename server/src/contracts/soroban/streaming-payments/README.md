# Streaming Payments Contract

A gasless implementation of Sablier-style money streaming on Stellar using Soroban.

## Features
- **Stream Creation**: Fund a stream with tokens from a sender to a recipient. Tokens are held securely in the contract.
- **Linear Vesting**: Streamed amount accumulates linearly between `start_time` and `stop_time`.
- **On-Demand Withdrawal**: Recipient can withdraw any accrued (streamed) tokens at any time.
- **Cancellation**: Sender can cancel the stream at any time. Remaining streamed tokens are distributed to the recipient, and unstreamed tokens are refunded to the sender.

## Interface
- `create_stream(env, sender: Address, recipient: Address, token: Address, amount: i128, start_time: u64, stop_time: u64) -> u32`: Create a new stream.
- `withdraw(env, stream_id: u32, amount: i128)`: Withdraw streamed tokens (recipient only).
- `cancel_stream(env, stream_id: u32)`: Cancel the stream and distribute payouts (sender only).
- `get_stream(env, stream_id: u32) -> Stream`: Retrieve stream state.
- `withdrawable_amount(env, stream_id: u32) -> i128`: Get the withdrawable balance at current ledger time.
