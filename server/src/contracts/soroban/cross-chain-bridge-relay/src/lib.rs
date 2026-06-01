#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, token, Bytes, BytesN};

#[contracttype]
pub enum DataKey {
    Admin,
    Validator,
    Processed(u64), // transfer_id
}

#[contract]
pub struct CrossChainBridgeRelay;

#[contractimpl]
impl CrossChainBridgeRelay {
    pub fn initialize(env: Env, admin: Address, validator_pubkey: BytesN<32>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Validator, &validator_pubkey);
    }

    pub fn relay_transfer(
        env: Env,
        recipient: Address,
        token: Address,
        amount: i128,
        from_chain: Symbol,
        transfer_id: u64,
        signature: BytesN<64>,
    ) {
        // Prevent replay attacks
        let key = DataKey::Processed(transfer_id);
        if env.storage().persistent().has(&key) {
            panic!("transfer already processed");
        }

        // Get validator public key
        let validator: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::Validator)
            .expect("not initialized");

        use soroban_sdk::xdr::ToXdr;
        // Construct message payload: recipient Address, token Address, amount i128, transfer_id u64
        let mut message = Bytes::new(&env);
        
        // Append raw bytes
        message.append(&recipient.clone().to_xdr(&env));
        message.append(&token.clone().to_xdr(&env));
        
        let mut amount_buf = [0u8; 16];
        amount_buf.copy_from_slice(&amount.to_be_bytes());
        message.append(&Bytes::from_array(&env, &amount_buf));

        let mut id_buf = [0u8; 8];
        id_buf.copy_from_slice(&transfer_id.to_be_bytes());
        message.append(&Bytes::from_array(&env, &id_buf));

        // Verify signature
        env.crypto().ed25519_verify(&validator, &message, &signature);

        // Mark as processed
        env.storage().persistent().set(&key, &true);

        // Execute token transfer
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &recipient, &amount);

        // Publish event
        env.events().publish(
            (symbol_short!("Bridge"), symbol_short!("relay")),
            (recipient, token, amount, from_chain, transfer_id),
        );
    }

    pub fn is_processed(env: Env, transfer_id: u64) -> bool {
        env.storage().persistent().has(&DataKey::Processed(transfer_id))
    }

    pub fn update_validator(env: Env, new_validator: BytesN<32>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Validator, &new_validator);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, BytesN as _};
    use soroban_sdk::token::{StellarAssetClient, TokenClient};

    fn create_token<'a>(env: &Env, admin: &Address) -> (TokenClient<'a>, StellarAssetClient<'a>) {
        let contract_address = env.register_stellar_asset_contract(admin.clone());
        (
            TokenClient::new(env, &contract_address),
            StellarAssetClient::new(env, &contract_address),
        )
    }

    #[test]
    fn test_relay_and_replay_protection() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, CrossChainBridgeRelay);
        let client = CrossChainBridgeRelayClient::new(&env, &contract_id);

        // Standard validator public key for test
        let validator_key = BytesN::from_array(&env, &[0u8; 32]);
        client.initialize(&admin, &validator_key);

        let (token, token_admin) = create_token(&env, &admin);
        token_admin.mint(&contract_id, &1000);

        let recipient = Address::generate(&env);
        let from_chain = Symbol::new(&env, "ethereum");
        let transfer_id: u64 = 42;

        use soroban_sdk::xdr::ToXdr;
        // Message to sign
        let mut message = Bytes::new(&env);
        message.append(&recipient.to_xdr(&env));
        message.append(&token.address.to_xdr(&env));
        
        let mut amount_buf = [0u8; 16];
        amount_buf.copy_from_slice(&500i128.to_be_bytes());
        message.append(&Bytes::from_array(&env, &amount_buf));

        let mut id_buf = [0u8; 8];
        id_buf.copy_from_slice(&transfer_id.to_be_bytes());
        message.append(&Bytes::from_array(&env, &id_buf));
    }
}
