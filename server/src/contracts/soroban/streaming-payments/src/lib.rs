#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, token};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stream {
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub amount: i128,
    pub start_time: u64,
    pub stop_time: u64,
    pub withdrawn_amount: i128,
    pub cancelled: bool,
}

#[contracttype]
pub enum DataKey {
    Stream(u32),
    StreamCount,
}

#[contract]
pub struct StreamingPaymentsContract;

#[contractimpl]
impl StreamingPaymentsContract {
    /// Create a new money stream.
    /// The total amount is transferred from the sender to the contract.
    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        amount: i128,
        start_time: u64,
        stop_time: u64,
    ) -> u32 {
        sender.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }
        if stop_time <= start_time {
            panic!("stop_time must be greater than start_time");
        }

        // Transfer tokens from sender to contract
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, &env.current_contract_address(), &amount);

        // Increment stream ID counter
        let mut count: u32 = env.storage().instance().get(&DataKey::StreamCount).unwrap_or(0);
        count += 1;

        let stream = Stream {
            sender: sender.clone(),
            recipient: recipient.clone(),
            token,
            amount,
            start_time,
            stop_time,
            withdrawn_amount: 0,
            cancelled: false,
        };

        // Persist stream state
        env.storage().persistent().set(&DataKey::Stream(count), &stream);
        env.storage().instance().set(&DataKey::StreamCount, &count);

        // Emit creation event
        env.events().publish(
            (symbol_short!("stream"), symbol_short!("create")),
            (count, sender, recipient, amount, start_time, stop_time),
        );

        count
    }

    /// Withdraw streamed tokens.
    /// Can only be called by the recipient.
    pub fn withdraw(env: Env, stream_id: u32, amount: i128) {
        if amount <= 0 {
            panic!("withdrawal amount must be positive");
        }

        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .expect("stream not found");

        if stream.cancelled {
            panic!("stream is cancelled");
        }

        // Only recipient is authorized to withdraw
        stream.recipient.require_auth();

        let withdrawable = Self::calculate_withdrawable(&env, &stream);

        if amount > withdrawable {
            panic!("amount exceeds withdrawable limit");
        }

        // Update withdrawn amount
        stream.withdrawn_amount += amount;
        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);

        // Transfer tokens to recipient
        let token_client = token::Client::new(&env, &stream.token);
        token_client.transfer(&env.current_contract_address(), &stream.recipient, &amount);

        // Emit withdraw event
        env.events().publish(
            (symbol_short!("stream"), symbol_short!("withdraw")),
            (stream_id, stream.recipient.clone(), amount),
        );
    }

    /// Cancel the stream.
    /// Returns the unstreamed portion to the sender and the remaining streamed portion to the recipient.
    /// Can only be called by the sender.
    pub fn cancel_stream(env: Env, stream_id: u32) {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .expect("stream not found");

        if stream.cancelled {
            panic!("stream already cancelled");
        }

        // Only sender is authorized to cancel
        stream.sender.require_auth();

        let current_time = env.ledger().timestamp();
        let elapsed = current_time.saturating_sub(stream.start_time);
        let duration = stream.stop_time.saturating_sub(stream.start_time);

        let streamed = if current_time >= stream.stop_time {
            stream.amount
        } else if current_time <= stream.start_time {
            0
        } else {
            (stream.amount * (elapsed as i128)) / (duration as i128)
        };

        let recipient_share = streamed.saturating_sub(stream.withdrawn_amount);
        let sender_share = stream.amount.saturating_sub(streamed);

        // Mark as cancelled and update withdrawn amount to reflect full payout
        stream.cancelled = true;
        stream.withdrawn_amount = streamed;
        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);

        let token_client = token::Client::new(&env, &stream.token);

        // Distribute remaining streamed funds to recipient
        if recipient_share > 0 {
            token_client.transfer(&env.current_contract_address(), &stream.recipient, &recipient_share);
        }

        // Refund unstreamed funds to sender
        if sender_share > 0 {
            token_client.transfer(&env.current_contract_address(), &stream.sender, &sender_share);
        }

        // Emit cancel event
        env.events().publish(
            (symbol_short!("stream"), symbol_short!("cancel")),
            (stream_id, sender_share, recipient_share),
        );
    }

    /// Get stream details.
    pub fn get_stream(env: Env, stream_id: u32) -> Stream {
        env.storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .expect("stream not found")
    }

    /// Helper to get withdrawable amount at current block timestamp.
    pub fn withdrawable_amount(env: Env, stream_id: u32) -> i128 {
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .expect("stream not found");

        if stream.cancelled {
            0
        } else {
            Self::calculate_withdrawable(&env, &stream)
        }
    }

    // Internal calculation of withdrawable funds
    fn calculate_withdrawable(env: &Env, stream: &Stream) -> i128 {
        let current_time = env.ledger().timestamp();
        if current_time <= stream.start_time {
            return 0;
        }

        let elapsed = current_time.saturating_sub(stream.start_time);
        let duration = stream.stop_time.saturating_sub(stream.start_time);

        let streamed = if current_time >= stream.stop_time {
            stream.amount
        } else {
            (stream.amount * (elapsed as i128)) / (duration as i128)
        };

        streamed.saturating_sub(stream.withdrawn_amount)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{Env, Address};
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::token::{StellarAssetClient, TokenClient};

    fn create_token<'a>(env: &Env, admin: &Address) -> (TokenClient<'a>, StellarAssetClient<'a>) {
        let contract_id = env.register_stellar_asset_contract(admin.clone());
        (
            TokenClient::new(env, &contract_id),
            StellarAssetClient::new(env, &contract_id),
        )
    }

    fn set_timestamp(env: &Env, timestamp: u64) {
        env.ledger().with_mut(|li| {
            li.timestamp = timestamp;
        });
    }

    #[test]
    fn test_create_stream() {
        let env = Env::default();
        env.mock_all_auths();
        set_timestamp(&env, 1000);

        let contract_id = env.register_contract(None, StreamingPaymentsContract);
        let client = StreamingPaymentsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let (token, token_admin) = create_token(&env, &admin);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        token_admin.mint(&sender, &1000);

        let stream_id = client.create_stream(&sender, &recipient, &token.address, &1000, &1000, &2000);
        assert_eq!(stream_id, 1);

        // Verify tokens are in contract
        assert_eq!(token.balance(&contract_id), 1000);
        assert_eq!(token.balance(&sender), 0);

        let stream = client.get_stream(&stream_id);
        assert_eq!(stream.sender, sender);
        assert_eq!(stream.recipient, recipient);
        assert_eq!(stream.amount, 1000);
        assert_eq!(stream.start_time, 1000);
        assert_eq!(stream.stop_time, 2000);
        assert_eq!(stream.withdrawn_amount, 0);
        assert_eq!(stream.cancelled, false);
    }

    #[test]
    fn test_withdraw_stream_partial_and_full() {
        let env = Env::default();
        env.mock_all_auths();
        set_timestamp(&env, 1000);

        let contract_id = env.register_contract(None, StreamingPaymentsContract);
        let client = StreamingPaymentsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let (token, token_admin) = create_token(&env, &admin);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        token_admin.mint(&sender, &1000);

        let stream_id = client.create_stream(&sender, &recipient, &token.address, &1000, &1000, &2000);

        // 25% through the stream (timestamp = 1250)
        set_timestamp(&env, 1250);
        assert_eq!(client.withdrawable_amount(&stream_id), 250);

        // Withdraw 150
        client.withdraw(&stream_id, &150);
        assert_eq!(token.balance(&recipient), 150);
        assert_eq!(token.balance(&contract_id), 850);
        assert_eq!(client.withdrawable_amount(&stream_id), 100);

        // Past the end of stream (timestamp = 2100)
        set_timestamp(&env, 2100);
        assert_eq!(client.withdrawable_amount(&stream_id), 850); // 1000 - 150

        // Withdraw remaining 850
        client.withdraw(&stream_id, &850);
        assert_eq!(token.balance(&recipient), 1000);
        assert_eq!(token.balance(&contract_id), 0);
        assert_eq!(client.withdrawable_amount(&stream_id), 0);
    }

    #[test]
    fn test_cancel_stream_middle() {
        let env = Env::default();
        env.mock_all_auths();
        set_timestamp(&env, 1000);

        let contract_id = env.register_contract(None, StreamingPaymentsContract);
        let client = StreamingPaymentsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let (token, token_admin) = create_token(&env, &admin);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        token_admin.mint(&sender, &1000);

        let stream_id = client.create_stream(&sender, &recipient, &token.address, &1000, &1000, &2000);

        // Halfway through (timestamp = 1500)
        set_timestamp(&env, 1500);
        assert_eq!(client.withdrawable_amount(&stream_id), 500);

        // Cancel
        client.cancel_stream(&stream_id);

        // Recipient gets 500, Sender gets 500 refund
        assert_eq!(token.balance(&recipient), 500);
        assert_eq!(token.balance(&sender), 500);
        assert_eq!(token.balance(&contract_id), 0);

        // Stream state is cancelled
        let stream = client.get_stream(&stream_id);
        assert!(stream.cancelled);
        assert_eq!(client.withdrawable_amount(&stream_id), 0);
    }

    #[test]
    fn test_cancel_before_start() {
        let env = Env::default();
        env.mock_all_auths();
        set_timestamp(&env, 500);

        let contract_id = env.register_contract(None, StreamingPaymentsContract);
        let client = StreamingPaymentsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let (token, token_admin) = create_token(&env, &admin);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        token_admin.mint(&sender, &1000);

        // Stream starts at 1000
        let stream_id = client.create_stream(&sender, &recipient, &token.address, &1000, &1000, &2000);

        // Cancel at 600 (before start)
        set_timestamp(&env, 600);
        client.cancel_stream(&stream_id);

        // Sender gets full refund, recipient gets 0
        assert_eq!(token.balance(&sender), 1000);
        assert_eq!(token.balance(&recipient), 0);
    }

    #[test]
    fn test_cancel_after_stop() {
        let env = Env::default();
        env.mock_all_auths();
        set_timestamp(&env, 1000);

        let contract_id = env.register_contract(None, StreamingPaymentsContract);
        let client = StreamingPaymentsContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let (token, token_admin) = create_token(&env, &admin);

        let sender = Address::generate(&env);
        let recipient = Address::generate(&env);

        token_admin.mint(&sender, &1000);

        let stream_id = client.create_stream(&sender, &recipient, &token.address, &1000, &1000, &2000);

        // Cancel at 2500 (after stop)
        set_timestamp(&env, 2500);
        client.cancel_stream(&stream_id);

        // Sender gets 0, recipient gets full amount
        assert_eq!(token.balance(&sender), 0);
        assert_eq!(token.balance(&recipient), 1000);
    }

}
