#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, token};

#[contracttype]
pub enum DataKey {
    Admin,
    TotalShares,
    TotalAssets,
    UserShares(Address),
}

#[contract]
pub struct YieldAggregatorVault;

#[contractimpl]
impl YieldAggregatorVault {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TotalShares, &0i128);
        env.storage().instance().set(&DataKey::TotalAssets, &0i128);
    }

    pub fn deposit(env: Env, user: Address, token: Address, amount: i128) -> i128 {
        user.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&user, &env.current_contract_address(), &amount);

        let total_shares: i128 = env.storage().instance().get(&DataKey::TotalShares).unwrap_or(0);
        let total_assets: i128 = env.storage().instance().get(&DataKey::TotalAssets).unwrap_or(0);

        let shares = if total_shares == 0 {
            amount
        } else {
            (amount * total_shares) / total_assets
        };

        let user_shares_key = DataKey::UserShares(user.clone());
        let user_shares: i128 = env.storage().persistent().get(&user_shares_key).unwrap_or(0);

        env.storage().persistent().set(&user_shares_key, &(user_shares + shares));
        env.storage().instance().set(&DataKey::TotalShares, &(total_shares + shares));
        env.storage().instance().set(&DataKey::TotalAssets, &(total_assets + amount));

        env.events().publish(
            (symbol_short!("Vault"), symbol_short!("deposit")),
            (user, token, amount, shares),
        );

        shares
    }

    pub fn withdraw(env: Env, user: Address, token: Address, share_amount: i128) -> i128 {
        user.require_auth();
        if share_amount <= 0 {
            panic!("share amount must be positive");
        }

        let user_shares_key = DataKey::UserShares(user.clone());
        let user_shares: i128 = env.storage().persistent().get(&user_shares_key).unwrap_or(0);
        if user_shares < share_amount {
            panic!("insufficient share balance");
        }

        let total_shares: i128 = env.storage().instance().get(&DataKey::TotalShares).unwrap_or(0);
        let total_assets: i128 = env.storage().instance().get(&DataKey::TotalAssets).unwrap_or(0);

        let asset_amount = (share_amount * total_assets) / total_shares;

        env.storage().persistent().set(&user_shares_key, &(user_shares - share_amount));
        env.storage().instance().set(&DataKey::TotalShares, &(total_shares - share_amount));
        env.storage().instance().set(&DataKey::TotalAssets, &(total_assets - asset_amount));

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &user, &asset_amount);

        env.events().publish(
            (symbol_short!("Vault"), symbol_short!("withdraw")),
            (user, token, asset_amount, share_amount),
        );

        asset_amount
    }

    pub fn rebalance(env: Env, from_pool: Address, to_pool: Address, token: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &to_pool, &amount);

        env.events().publish(
            (symbol_short!("Vault"), symbol_short!("rebalance")),
            (from_pool, to_pool, amount),
        );
    }

    pub fn get_shares(env: Env, user: Address) -> i128 {
        env.storage().persistent().get(&DataKey::UserShares(user)).unwrap_or(0)
    }

    pub fn get_total_shares(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalShares).unwrap_or(0)
    }

    pub fn get_total_assets(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalAssets).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::token::{StellarAssetClient, TokenClient};

    fn create_token<'a>(env: &Env, admin: &Address) -> (TokenClient<'a>, StellarAssetClient<'a>) {
        let contract_address = env.register_stellar_asset_contract(admin.clone());
        (
            TokenClient::new(env, &contract_address),
            StellarAssetClient::new(env, &contract_address),
        )
    }

    #[test]
    fn test_deposit_withdraw_rebalance() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, YieldAggregatorVault);
        let client = YieldAggregatorVaultClient::new(&env, &contract_id);
        client.initialize(&admin);

        let (token, token_admin) = create_token(&env, &admin);

        let user1 = Address::generate(&env);
        token_admin.mint(&user1, &1000);
        token_admin.mint(&contract_id, &1000); // add seed reserve for withdrawals/rebalancing

        // Deposit 500
        let shares = client.deposit(&user1, &token.address, &500);
        assert_eq!(shares, 500);
        assert_eq!(client.get_shares(&user1), 500);
        assert_eq!(client.get_total_shares(), 500);
        assert_eq!(client.get_total_assets(), 500);

        // Withdraw 200 shares
        let asset_amount = client.withdraw(&user1, &token.address, &200);
        assert_eq!(asset_amount, 200);
        assert_eq!(client.get_shares(&user1), 300);
        assert_eq!(client.get_total_shares(), 300);
        assert_eq!(client.get_total_assets(), 300);

        // Rebalance
        let mock_pool = Address::generate(&env);
        client.rebalance(&mock_pool, &mock_pool, &token.address, &100);
        assert_eq!(token.balance(&mock_pool), 100);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_zero_deposit() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, YieldAggregatorVault);
        let client = YieldAggregatorVaultClient::new(&env, &contract_id);
        client.initialize(&admin);

        let (token, _) = create_token(&env, &admin);
        let user = Address::generate(&env);

        client.deposit(&user, &token.address, &0);
    }

    #[test]
    #[should_panic(expected = "insufficient share balance")]
    fn test_insufficient_withdraw() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register_contract(None, YieldAggregatorVault);
        let client = YieldAggregatorVaultClient::new(&env, &contract_id);
        client.initialize(&admin);

        let (token, _) = create_token(&env, &admin);
        let user = Address::generate(&env);

        client.withdraw(&user, &token.address, &100);
    }
}
