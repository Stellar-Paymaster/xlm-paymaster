#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, token};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowConfig {
    pub initiator: Address,
    pub counterparty: Address,
    pub token_a: Address,
    pub amount_a: i128,
    pub token_b: Address,
    pub amount_b: i128,
}

#[contract]
pub struct EscrowContract;

const CONFIG: Symbol = symbol_short!("CONFIG");
const STATE: Symbol = symbol_short!("STATE");

#[contracttype]
pub enum EscrowState {
    Active,
    Completed,
    Refunded,
}

#[contractimpl]
impl EscrowContract {
    pub fn initialize(
        env: Env,
        initiator: Address,
        counterparty: Address,
        token_a: Address,
        amount_a: i128,
        token_b: Address,
        amount_b: i128,
    ) {
        if env.storage().instance().has(&CONFIG) {
            panic!("already initialized");
        }

        let config = EscrowConfig {
            initiator,
            counterparty,
            token_a,
            amount_a,
            token_b,
            amount_b,
        };

        env.storage().instance().set(&CONFIG, &config);
        env.storage().instance().set(&STATE, &EscrowState::Active);
    }

    pub fn complete(env: Env, counterparty: Address) {
        counterparty.require_auth();

        let config: EscrowConfig = env.storage().instance().get(&CONFIG).unwrap();
        let state: EscrowState = env.storage().instance().get(&STATE).unwrap();

        if !matches!(state, EscrowState::Active) {
            panic!("escrow not active");
        }

        if counterparty != config.counterparty {
            panic!("not authorized");
        }

        let token_a = token::Client::new(&env, &config.token_a);
        let token_b = token::Client::new(&env, &config.token_b);

        // Counterparty pays token_b to initiator
        token_b.transfer(&counterparty, &config.initiator, &config.amount_b);

        // Escrow contract pays token_a to counterparty
        token_a.transfer(&env.current_contract_address(), &counterparty, &config.amount_a);

        env.storage().instance().set(&STATE, &EscrowState::Completed);
        env.events().publish((symbol_short!("Escrow"), symbol_short!("complete")), ());
    }

    pub fn refund(env: Env) {
        let config: EscrowConfig = env.storage().instance().get(&CONFIG).unwrap();
        config.initiator.require_auth();

        let state: EscrowState = env.storage().instance().get(&STATE).unwrap();
        if !matches!(state, EscrowState::Active) {
            panic!("escrow not active");
        }

        let token_a = token::Client::new(&env, &config.token_a);
        token_a.transfer(&env.current_contract_address(), &config.initiator, &config.amount_a);

        env.storage().instance().set(&STATE, &EscrowState::Refunded);
        env.events().publish((symbol_short!("Escrow"), symbol_short!("refund")), ());
    }

    pub fn get_config(env: Env) -> EscrowConfig {
        env.storage().instance().get(&CONFIG).unwrap()
    }
}
