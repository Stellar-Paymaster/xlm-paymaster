#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, BytesN, Vec, token, IntoVal};

#[contract]
pub struct EscrowFactory;

#[contracttype]
pub enum DataKey {
    EscrowWasmHash,
    Admin,
}

#[contractimpl]
impl EscrowFactory {
    pub fn initialize(env: Env, admin: Address, wasm_hash: BytesN<32>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::EscrowWasmHash, &wasm_hash);
    }

    pub fn deploy_escrow(
        env: Env,
        salt: BytesN<32>,
        initiator: Address,
        counterparty: Address,
        token_a: Address,
        amount_a: i128,
        token_b: Address,
        amount_b: i128,
    ) -> Address {
        initiator.require_auth();

        let wasm_hash: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::EscrowWasmHash)
            .expect("wasm hash not set");

        // Deploy the contract
        let pair_salt = env.crypto().sha256(&salt.into());
        let escrow_address = env
            .deployer()
            .with_current_contract(pair_salt)
            .deploy(wasm_hash);

        // Pull tokens from initiator to the new escrow contract
        let token_client = token::Client::new(&env, &token_a);
        token_client.transfer(&initiator, &escrow_address, &amount_a);

        // Initialize the escrow contract
        // Note: We need to call initialize on the deployed contract.
        // We'll use the generic invoke or a client if we had the trait.
        // For this implementation, we'll assume the client is available or use raw invoke.
        env.invoke_contract::<()>(
            &escrow_address,
            &Symbol::new(&env, "initialize"),
            soroban_sdk::vec![&env, initiator.into_val(&env), counterparty.into_val(&env), token_a.into_val(&env), amount_a.into_val(&env), token_b.into_val(&env), amount_b.into_val(&env)],
        );

        env.events().publish(
            (symbol_short!("Factory"), symbol_short!("deploy")),
            escrow_address.clone(),
        );

        escrow_address
    }
}
