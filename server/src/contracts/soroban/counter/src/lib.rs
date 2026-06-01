#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, Env, Symbol};

const COUNT: Symbol = symbol_short!("COUNT");

#[contract]
pub struct CounterContract;

#[contractimpl]
impl CounterContract {
    pub fn increment(env: Env) -> u32 {
        let mut count: u32 = env.storage().instance().get(&COUNT).unwrap_or(0);
        count += 1;
        env.storage().instance().set(&COUNT, &count);
        
        // Emit event for relayer to pick up
        // Topics are (Counter, increment)
        env.events().publish((symbol_short!("Counter"), symbol_short!("increment")), count);
        
        count
    }

    pub fn sync_count(env: Env, new_count: u32) {
        // In a real implementation, we would check if the caller is the authorized relayer.
        // For this PoC, we prioritize showing the state sync functionality.
        env.storage().instance().set(&COUNT, &new_count);
        
        // Emit sync event
        env.events().publish((symbol_short!("Counter"), symbol_short!("sync")), new_count);
    }

    pub fn get_count(env: Env) -> u32 {
        env.storage().instance().get(&COUNT).unwrap_or(0)
    }
}
