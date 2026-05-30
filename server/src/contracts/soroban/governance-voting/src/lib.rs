#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u32,
    pub description: String,
    pub deadline: u64,
    pub for_votes: i128,
    pub against_votes: i128,
    pub executed: bool,
}

#[contracttype]
pub enum DataKey {
    Proposal(u32),
    ProposalCount,
    Voted(u32, Address),
}

#[contract]
pub struct GovernanceVoting;

#[contractimpl]
impl GovernanceVoting {
    /// Create a new proposal for fee sponsorship.
    pub fn create_proposal(env: Env, description: String, duration_seconds: u64) -> u32 {
        let mut count: u32 = env.storage().instance().get(&DataKey::ProposalCount).unwrap_or(0);
        count += 1;
        
        let proposal = Proposal {
            id: count,
            description,
            deadline: env.ledger().timestamp() + duration_seconds,
            for_votes: 0,
            against_votes: 0,
            executed: false,
        };

        env.storage().persistent().set(&DataKey::Proposal(count), &proposal);
        env.storage().instance().set(&DataKey::ProposalCount, &count);

        env.events().publish(
            (symbol_short!("Gov"), symbol_short!("created")),
            count,
        );

        count
    }

    /// Vote on a proposal.
    /// In this simple version, each address has 1 vote weight.
    pub fn vote(env: Env, voter: Address, proposal_id: u32, support: bool) {
        voter.require_auth();

        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .expect("proposal not found");

        if env.ledger().timestamp() > proposal.deadline {
            panic!("voting period ended");
        }

        let voted_key = DataKey::Voted(proposal_id, voter.clone());
        if env.storage().persistent().has(&voted_key) {
            panic!("already voted");
        }

        if support {
            proposal.for_votes += 1;
        } else {
            proposal.against_votes += 1;
        }

        env.storage().persistent().set(&DataKey::Proposal(proposal_id), &proposal);
        env.storage().persistent().set(&voted_key, &true);

        env.events().publish(
            (symbol_short!("Gov"), symbol_short!("vote")),
            (proposal_id, voter, support),
        );
    }

    pub fn get_proposal(env: Env, proposal_id: u32) -> Proposal {
        env.storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .expect("proposal not found")
    }

    pub fn get_proposal_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::ProposalCount).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Env as _, Ledger};

    #[test]
    fn test_voting() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1000);

        let contract_id = env.register_contract(None, GovernanceVoting);
        let client = GovernanceVotingClient::new(&env, &contract_id);

        let desc = String::from_slice(&env, "Sponsor Fee for NFT Royalty Splitter");
        let proposal_id = client.create_proposal(&desc, &3600);

        let voter1 = Address::generate(&env);
        let voter2 = Address::generate(&env);
        let voter3 = Address::generate(&env);

        client.vote(&voter1, &proposal_id, &true);
        client.vote(&voter2, &proposal_id, &true);
        client.vote(&voter3, &proposal_id, &false);

        let proposal = client.get_proposal(&proposal_id);
        assert_eq!(proposal.for_votes, 2);
        assert_eq!(proposal.against_votes, 1);
        assert_eq!(proposal.deadline, 4600);
    }

    #[test]
    #[should_panic(expected = "voting period ended")]
    fn test_expired_vote() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1000);

        let contract_id = env.register_contract(None, GovernanceVoting);
        let client = GovernanceVotingClient::new(&env, &contract_id);

        let proposal_id = client.create_proposal(&String::from_slice(&env, "Test"), &100);

        env.ledger().set_timestamp(1200);
        let voter = Address::generate(&env);
        client.vote(&voter, &proposal_id, &true);
    }
}
