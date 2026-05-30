# Governance Voting Contract

A gasless voting system for community-led fee sponsorship decisions.

## Features
- **Proposal Creation**: Propose new sponsorship rules with a description and deadline.
- **One-Address-One-Vote**: Simple and fair voting weight.
- **Gasless Capability**: Designed to work with Fluid's relayer for sponsored transactions.

## Interface
- `create_proposal(env, description: String, duration_seconds: u64)`: Create a new proposal.
- `vote(env, voter: Address, proposal_id: u32, support: bool)`: Cast a vote.
- `get_proposal(env, proposal_id: u32)`: Check proposal status and results.
