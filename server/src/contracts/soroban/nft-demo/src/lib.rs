#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, Env, Symbol, String, Address, Map};

const TOTAL_SUPPLY: Symbol = symbol_short!("SUPPLY");
const METADATA_PREFIX: &str = "META";

#[contract]
pub struct NFTContract;

#[contractimpl]
impl NFTContract {
    /// Mint a new NFT
    /// Returns the token ID of the newly minted NFT
    pub fn mint(env: Env, recipient: Address, metadata: String) -> u32 {
        // Get current supply
        let mut supply: u32 = env.storage().instance().get(&TOTAL_SUPPLY).unwrap_or(0);

        // Increment supply (new token ID)
        supply += 1;
        let token_id = supply;

        // Store metadata with token ID as key
        let metadata_key = Symbol::new(&env, &format!("{}{}", METADATA_PREFIX, token_id));
        env.storage().persistent().set(&metadata_key, &metadata);

        // Store owner mapping
        let owner_key = Symbol::new(&env, &format!("OWNER{}", token_id));
        env.storage().persistent().set(&owner_key, &recipient);

        // Update total supply
        env.storage().instance().set(&TOTAL_SUPPLY, &supply);

        // Emit mint event
        env.events().publish(
            (symbol_short!("NFT"), symbol_short!("mint")),
            (token_id, recipient.clone(), metadata),
        );

        token_id
    }

    /// Get metadata for a token ID
    pub fn get_metadata(env: Env, token_id: u32) -> String {
        let metadata_key = Symbol::new(&env, &format!("{}{}", METADATA_PREFIX, token_id));
        env.storage()
            .persistent()
            .get(&metadata_key)
            .unwrap_or_else(|| String::new(&env))
    }

    /// Get owner of a token
    pub fn get_owner(env: Env, token_id: u32) -> Address {
        let owner_key = Symbol::new(&env, &format!("OWNER{}", token_id));
        env.storage()
            .persistent()
            .get(&owner_key)
            .unwrap_or_else(|| Address::from_contract_id(&env, &env.current_contract_address()))
    }

    /// Get total supply
    pub fn get_total_supply(env: Env) -> u32 {
        env.storage().instance().get(&TOTAL_SUPPLY).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Env as _};

    #[test]
    fn test_mint() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NFTContract);
        let client = NFTContractClient::new(&env, &contract_id);

        let recipient = Address::random(&env);
        let metadata = String::from_slice(&env, "NFT Demo #1");

        let token_id = client.mint(&recipient, &metadata);

        assert_eq!(token_id, 1);
        assert_eq!(client.get_total_supply(), 1);
        assert_eq!(client.get_metadata(&token_id), metadata);
        assert_eq!(client.get_owner(&token_id), recipient);
    }

    #[test]
    fn test_mint_multiple() {
        let env = Env::default();
        let contract_id = env.register_contract(None, NFTContract);
        let client = NFTContractClient::new(&env, &contract_id);

        let recipient1 = Address::random(&env);
        let recipient2 = Address::random(&env);

        let token_id1 = client.mint(&recipient1, &String::from_slice(&env, "NFT #1"));
        let token_id2 = client.mint(&recipient2, &String::from_slice(&env, "NFT #2"));

        assert_eq!(token_id1, 1);
        assert_eq!(token_id2, 2);
        assert_eq!(client.get_total_supply(), 2);
    }
}
