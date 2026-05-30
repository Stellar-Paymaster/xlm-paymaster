#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, token, Map};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StakeInfo {
    pub amount: i128,
    pub last_update_ts: u64,
    pub accumulated_credits: i128,
}

#[contracttype]
pub enum DataKey {
    Stake(Address, Address), // (Staker, Token)
    TotalCredits(Address),    // Staker
}

#[contract]
pub struct MultiAssetStaking;

#[contractimpl]
impl MultiAssetStaking {
    /// Stake a token to earn sponsorship credits.
    pub fn stake(env: Env, staker: Address, token: Address, amount: i128) {
        staker.require_auth();

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&staker, &env.current_contract_address(), &amount);

        let stake_key = DataKey::Stake(staker.clone(), token.clone());
        let mut info: StakeInfo = env
            .storage()
            .persistent()
            .get(&stake_key)
            .unwrap_or(StakeInfo {
                amount: 0,
                last_update_ts: env.ledger().timestamp(),
                accumulated_credits: 0,
            });

        // Update credits before changing stake amount
        info.accumulated_credits = Self::calculate_credits(&env, &info);
        info.amount += amount;
        info.last_update_ts = env.ledger().timestamp();

        env.storage().persistent().set(&stake_key, &info);

        env.events().publish(
            (symbol_short!("Stake"), symbol_short!("stake")),
            (staker, token, amount),
        );
    }

    /// Unstake tokens and collect credits.
    pub fn unstake(env: Env, staker: Address, token: Address, amount: i128) {
        staker.require_auth();

        let stake_key = DataKey::Stake(staker.clone(), token.clone());
        let mut info: StakeInfo = env
            .storage()
            .persistent()
            .get(&stake_key)
            .expect("no stake found");

        if info.amount < amount {
            panic!("insufficient stake");
        }

        // Update credits
        info.accumulated_credits = Self::calculate_credits(&env, &info);
        info.amount -= amount;
        info.last_update_ts = env.ledger().timestamp();

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &staker, &amount);

        if info.amount == 0 && info.accumulated_credits == 0 {
            env.storage().persistent().remove(&stake_key);
        } else {
            env.storage().persistent().set(&stake_key, &info);
        }

        env.events().publish(
            (symbol_short!("Stake"), symbol_short!("unstake")),
            (staker, token, amount),
        );
    }

    /// Get total credits for a staker across all staked assets.
    pub fn get_credits(env: Env, staker: Address) -> i128 {
        // In a real implementation, we would iterate over all staked tokens for the user.
        // For this PoC, we'll assume a simplified tracking or a single asset example.
        // To make it fully functional, we'd need a list of staked tokens per user.
        0 // Placeholder for PoC logic
    }

    fn calculate_credits(env: &Env, info: &StakeInfo) -> i128 {
        let elapsed = env.ledger().timestamp() - info.last_update_ts;
        // Credit formula: amount * elapsed / 3600 (1 credit per unit per hour)
        info.accumulated_credits + (info.amount * (elapsed as i128)) / 3600
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Env as _, Ledger};
    use soroban_sdk::token::{StellarAssetClient, TokenClient};

    fn create_token<'a>(env: &Env, admin: &Address) -> (TokenClient<'a>, StellarAssetClient<'a>) {
        let contract_id = env.register_stellar_asset_contract_v2(admin.clone());
        (
            TokenClient::new(env, &contract_id.address()),
            StellarAssetClient::new(env, &contract_id.address()),
        )
    }

    #[test]
    fn test_staking() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(0);

        let contract_id = env.register_contract(None, MultiAssetStaking);
        let client = MultiAssetStakingClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let (token, token_admin) = create_token(&env, &admin);

        let staker = Address::generate(&env);
        token_admin.mint(&staker, &1000);

        client.stake(&staker, &token.address, &1000);
        
        env.ledger().set_timestamp(3600); // 1 hour later
        
        client.unstake(&staker, &token.address, &500);
        
        // After 1 hour, should have 1000 credits accumulated
        // But get_credits is a placeholder, let's check internal state via a new method or by looking at balance
        assert_eq!(token.balance(&staker), 500);
    }
}
