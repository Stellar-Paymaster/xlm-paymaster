#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec, token};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Recipient {
    pub address: Address,
    pub bps: u32, // Basis points (1 = 0.01%, 10000 = 100%)
}

#[contract]
pub struct RoyaltySplitter;

const RECIPIENTS: Symbol = symbol_short!("RECIPI");

#[contractimpl]
impl RoyaltySplitter {
    /// Initialize the contract with a list of recipients and their share in basis points.
    /// Total basis points must sum to 10,000.
    pub fn initialize(env: Env, recipients: Vec<Recipient>) {
        if env.storage().instance().has(&RECIPIENTS) {
            panic!("already initialized");
        }

        let mut total_bps: u32 = 0;
        for recipient in recipients.iter() {
            total_bps += recipient.bps;
        }

        if total_bps != 10000 {
            panic!("total basis points must be 10,000");
        }

        env.storage().instance().set(&RECIPIENTS, &recipients);
    }

    /// Split a token amount among the recipients.
    /// The caller must have authorized the transfer of 'amount' of 'token' to this contract.
    pub fn split(env: Env, sender: Address, token: Address, amount: i128) {
        sender.require_auth();

        let recipients: Vec<Recipient> = env
            .storage()
            .instance()
            .get(&RECIPIENTS)
            .expect("not initialized");

        let token_client = token::Client::new(&env, &token);
        
        // Pull tokens from sender to this contract
        token_client.transfer(&sender, &env.current_contract_address(), &amount);

        let mut distributed: i128 = 0;
        let recipient_count = recipients.len();

        for i in 0..recipient_count {
            let recipient = recipients.get(i).unwrap();
            
            // Calculate share: (amount * bps) / 10000
            // We use i128 for calculation to prevent overflow before division
            let share = (amount * (recipient.bps as i128)) / 10000;
            
            if share > 0 {
                token_client.transfer(&env.current_contract_address(), &recipient.address, &share);
                distributed += share;
            }

            // Handle dust in the last recipient
            if i == recipient_count - 1 {
                let dust = amount - distributed;
                if dust > 0 {
                    token_client.transfer(&env.current_contract_address(), &recipient.address, &dust);
                }
            }
        }

        env.events().publish(
            (symbol_short!("royalty"), symbol_short!("split")),
            (token, amount),
        );
    }

    pub fn get_recipients(env: Env) -> Vec<Recipient> {
        env.storage()
            .instance()
            .get(&RECIPIENTS)
            .unwrap_or_else(|| Vec::new(&env))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Env as _};
    use soroban_sdk::token::{StellarAssetClient, TokenClient};

    fn create_token<'a>(env: &Env, admin: &Address) -> (TokenClient<'a>, StellarAssetClient<'a>) {
        let contract_id = env.register_stellar_asset_contract_v2(admin.clone());
        (
            TokenClient::new(env, &contract_id.address()),
            StellarAssetClient::new(env, &contract_id.address()),
        )
    }

    #[test]
    fn test_split() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, RoyaltySplitter);
        let client = RoyaltySplitterClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let (token, token_admin) = create_token(&env, &admin);

        let recipient1 = Address::generate(&env);
        let recipient2 = Address::generate(&env);

        let recipients = Vec::from_array(
            &env,
            [
                Recipient {
                    address: recipient1.clone(),
                    bps: 2500, // 25%
                },
                Recipient {
                    address: recipient2.clone(),
                    bps: 7500, // 75%
                },
            ],
        );

        client.initialize(&recipients);

        let sender = Address::generate(&env);
        token_admin.mint(&sender, &1000);

        client.split(&sender, &token.address, &1000);

        assert_eq!(token.balance(&recipient1), 250);
        assert_eq!(token.balance(&recipient2), 750);
        assert_eq!(token.balance(&sender), 0);
    }

    #[test]
    #[should_panic(expected = "total basis points must be 10,000")]
    fn test_invalid_initialize() {
        let env = Env::default();
        let contract_id = env.register_contract(None, RoyaltySplitter);
        let client = RoyaltySplitterClient::new(&env, &contract_id);

        let recipients = Vec::from_array(
            &env,
            [
                Recipient {
                    address: Address::generate(&env),
                    bps: 5000,
                },
            ],
        );

        client.initialize(&recipients);
    }
}
