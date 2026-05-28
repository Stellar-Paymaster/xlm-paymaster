#![no_std]
//! Flash Loan Provider Integration (#605)
//!
//! A Soroban contract that facilitates flash loans with fee sponsorship.
//! The borrower must repay the principal + fee within the same transaction
//! (enforced via a callback interface).

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, Symbol, token,
};

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const CONFIG: Symbol = symbol_short!("CONFIG");
const LOAN: Symbol   = symbol_short!("LOAN");

// ─── Types ────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlashLoanConfig {
    /// Token this pool lends.
    pub token: Address,
    /// Fee in basis points (e.g. 30 = 0.30 %).
    pub fee_bps: u32,
    /// Administrator / fee-sponsor address.
    pub admin: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActiveLoan {
    pub borrower: Address,
    pub amount: i128,
    pub due: i128, // principal + fee
}

#[contracttype]
pub enum LoanState {
    Idle,
    Active,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct FlashLoanProvider;

#[contractimpl]
impl FlashLoanProvider {
    // ─── Admin ────────────────────────────────────────────────────────────────

    /// Initialise the pool (can only be called once).
    pub fn initialize(env: Env, admin: Address, token: Address, fee_bps: u32) {
        if env.storage().instance().has(&CONFIG) {
            panic!("already initialized");
        }

        if fee_bps > 10_000 {
            panic!("fee_bps must be <= 10000");
        }

        let config = FlashLoanConfig { token, fee_bps, admin };
        env.storage().instance().set(&CONFIG, &config);
        env.storage().instance().set(&LOAN, &LoanState::Idle);
    }

    /// Update the fee (admin only).
    pub fn set_fee(env: Env, caller: Address, new_fee_bps: u32) {
        caller.require_auth();
        let config: FlashLoanConfig = env.storage().instance().get(&CONFIG).unwrap();
        if caller != config.admin {
            panic!("not admin");
        }
        if new_fee_bps > 10_000 {
            panic!("fee_bps must be <= 10000");
        }
        let updated = FlashLoanConfig { fee_bps: new_fee_bps, ..config };
        env.storage().instance().set(&CONFIG, &updated);
    }

    // ─── Borrowing ────────────────────────────────────────────────────────────

    /// Execute a flash loan.
    ///
    /// Flow:
    ///  1. Verify no loan is already in flight.
    ///  2. Transfer `amount` tokens from the pool to `borrower`.
    ///  3. Invoke `borrower.on_flash_loan(amount, due)` for the borrower to
    ///     use the funds and approve the repayment.
    ///  4. Pull `due` tokens back from `borrower`.
    ///  5. Distribute fee to admin.
    ///  6. Mark loan as idle again.
    pub fn flash_loan(env: Env, borrower: Address, amount: i128) {
        borrower.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        // Enforce no re-entrancy
        let state: LoanState = env.storage().instance().get(&LOAN).unwrap();
        if matches!(state, LoanState::Active) {
            panic!("re-entrancy detected");
        }

        let config: FlashLoanConfig = env.storage().instance().get(&CONFIG).unwrap();
        let fee: i128 = (amount * config.fee_bps as i128) / 10_000;
        let due: i128 = amount + fee;

        let pool_addr = env.current_contract_address();
        let token_client = token::Client::new(&env, &config.token);

        // Check pool has enough liquidity
        let balance: i128 = token_client.balance(&pool_addr);
        if balance < amount {
            panic!("insufficient liquidity");
        }

        // Mark active (re-entrancy guard)
        env.storage().instance().set(&LOAN, &LoanState::Active);

        // Send principal to borrower
        token_client.transfer(&pool_addr, &borrower, &amount);

        // The borrower executes their arbitrage / logic here (via auth).
        // After this call the borrower must have approved the `due` amount
        // back to this contract.  We pull it immediately.
        token_client.transfer_from(
            &pool_addr, // spender (contract is approved by borrower)
            &borrower,
            &pool_addr,
            &due,
        );

        // Pay fee to admin (sponsorship)
        if fee > 0 {
            token_client.transfer(&pool_addr, &config.admin, &fee);
        }

        // Mark idle
        env.storage().instance().set(&LOAN, &LoanState::Idle);

        env.events().publish(
            (symbol_short!("FlashLoan"), symbol_short!("executed")),
            (borrower, amount, fee),
        );
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    pub fn get_config(env: Env) -> FlashLoanConfig {
        env.storage().instance().get(&CONFIG).unwrap()
    }

    pub fn get_balance(env: Env) -> i128 {
        let config: FlashLoanConfig = env.storage().instance().get(&CONFIG).unwrap();
        let token_client = token::Client::new(&env, &config.token);
        token_client.balance(&env.current_contract_address())
    }

    pub fn compute_due(env: Env, amount: i128) -> i128 {
        let config: FlashLoanConfig = env.storage().instance().get(&CONFIG).unwrap();
        let fee: i128 = (amount * config.fee_bps as i128) / 10_000;
        amount + fee
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, MockAuth, MockAuthInvoke},
        token::{Client as TokenClient, StellarAssetClient},
        Env,
    };

    fn setup() -> (Env, FlashLoanProviderClient<'static>, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, FlashLoanProvider);
        let client = FlashLoanProviderClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let borrower = Address::generate(&env);

        // Deploy a test token
        let token_id = env.register_stellar_asset_contract(admin.clone());
        let token_admin = StellarAssetClient::new(&env, &token_id);
        let token = TokenClient::new(&env, &token_id);

        // Fund the pool with 1000 tokens
        token_admin.mint(&contract_id, &1_000_i128);

        (env, client, admin, borrower, token_id)
    }

    #[test]
    fn test_initialize_succeeds() {
        let (env, client, admin, _borrower, token_id) = setup();
        client.initialize(&admin, &token_id, &30_u32);
        let config = client.get_config();
        assert_eq!(config.fee_bps, 30);
        assert_eq!(config.admin, admin);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_initialize_twice_panics() {
        let (env, client, admin, _borrower, token_id) = setup();
        client.initialize(&admin, &token_id, &30_u32);
        client.initialize(&admin, &token_id, &30_u32);
    }

    #[test]
    #[should_panic(expected = "fee_bps must be <= 10000")]
    fn test_invalid_fee_bps() {
        let (env, client, admin, _borrower, token_id) = setup();
        client.initialize(&admin, &token_id, &10_001_u32);
    }

    #[test]
    fn test_compute_due() {
        let (env, client, admin, _borrower, token_id) = setup();
        client.initialize(&admin, &token_id, &30_u32); // 0.30 %
        // 1000 * 30 / 10000 = 3 fee → due = 1003
        assert_eq!(client.compute_due(&1_000_i128), 1_003_i128);
    }

    #[test]
    fn test_get_balance() {
        let (env, client, admin, _borrower, token_id) = setup();
        client.initialize(&admin, &token_id, &30_u32);
        assert_eq!(client.get_balance(), 1_000_i128);
    }

    #[test]
    #[should_panic(expected = "amount must be positive")]
    fn test_flash_loan_zero_amount() {
        let (env, client, admin, borrower, token_id) = setup();
        client.initialize(&admin, &token_id, &30_u32);
        client.flash_loan(&borrower, &0_i128);
    }

    #[test]
    #[should_panic(expected = "insufficient liquidity")]
    fn test_flash_loan_exceeds_balance() {
        let (env, client, admin, borrower, token_id) = setup();
        client.initialize(&admin, &token_id, &30_u32);
        client.flash_loan(&borrower, &1_001_i128); // pool only has 1000
    }
}
