#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Bytes, BytesN};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DIDInfo {
    pub did: Symbol,
    pub identity_pubkey: BytesN<32>,
    pub active: bool,
    pub updated_at: u64,
}

#[contracttype]
pub enum DataKey {
    IdentityToDID(Address),
    DIDToIdentity(Symbol),
}

#[contract]
pub struct IdentityRegistryDID;

#[contractimpl]
impl IdentityRegistryDID {
    /// Register a DID document directly using Soroban auth.
    pub fn register_did(env: Env, identity: Address, did: Symbol, identity_pubkey: BytesN<32>) {
        identity.require_auth();

        let id_key = DataKey::IdentityToDID(identity.clone());
        if env.storage().persistent().has(&id_key) {
            panic!("identity already registered");
        }

        let did_key = DataKey::DIDToIdentity(did.clone());
        if env.storage().persistent().has(&did_key) {
            panic!("DID already taken");
        }

        let info = DIDInfo {
            did: did.clone(),
            identity_pubkey,
            active: true,
            updated_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&id_key, &info);
        env.storage().persistent().set(&did_key, &identity);

        env.events().publish(
            (symbol_short!("DID"), symbol_short!("register")),
            (identity, did),
        );
    }

    /// Sponsored registration where a relayer submits the transaction and pays the fees.
    /// The user authorizes it via a cryptographic signature.
    pub fn register_did_sponsored(
        env: Env,
        identity: Address,
        did: Symbol,
        identity_pubkey: BytesN<32>,
        signature: BytesN<64>,
    ) {
        let id_key = DataKey::IdentityToDID(identity.clone());
        if env.storage().persistent().has(&id_key) {
            panic!("identity already registered");
        }

        let did_key = DataKey::DIDToIdentity(did.clone());
        if env.storage().persistent().has(&did_key) {
            panic!("DID already taken");
        }

        use soroban_sdk::xdr::ToXdr;
        // Construct message payload: (identity Address XDR, did Symbol XDR, identity_pubkey bytes)
        let mut message = Bytes::new(&env);
        message.append(&identity.clone().to_xdr(&env));
        message.append(&did.clone().to_xdr(&env));
        message.append(&identity_pubkey.clone().into());

        // Verify the signature
        env.crypto().ed25519_verify(&identity_pubkey, &message, &signature);

        let info = DIDInfo {
            did: did.clone(),
            identity_pubkey,
            active: true,
            updated_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&id_key, &info);
        env.storage().persistent().set(&did_key, &identity);

        env.events().publish(
            (symbol_short!("DID"), symbol_short!("sponsor")),
            (identity, did),
        );
    }

    pub fn resolve_did(env: Env, identity: Address) -> DIDInfo {
        env.storage()
            .persistent()
            .get(&DataKey::IdentityToDID(identity))
            .expect("identity not found")
    }

    pub fn resolve_by_did(env: Env, did: Symbol) -> Address {
        env.storage()
            .persistent()
            .get(&DataKey::DIDToIdentity(did))
            .expect("DID not found")
    }

    pub fn revoke_did(env: Env, identity: Address) {
        identity.require_auth();

        let id_key = DataKey::IdentityToDID(identity.clone());
        let mut info: DIDInfo = env
            .storage()
            .persistent()
            .get(&id_key)
            .expect("identity not registered");

        if !info.active {
            panic!("DID already revoked");
        }

        info.active = false;
        info.updated_at = env.ledger().timestamp();

        env.storage().persistent().set(&id_key, &info);

        env.events().publish(
            (symbol_short!("DID"), symbol_short!("revoke")),
            (identity, info.did),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_did_registry_direct_and_revocation() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, IdentityRegistryDID);
        let client = IdentityRegistryDIDClient::new(&env, &contract_id);

        let identity = Address::generate(&env);
        let did = Symbol::new(&env, "did_fluid_user123");
        let pubkey = BytesN::from_array(&env, &[0u8; 32]);

        client.register_did(&identity, &did, &pubkey);

        let info = client.resolve_did(&identity);
        assert_eq!(info.did, did);
        assert_eq!(info.identity_pubkey, pubkey);
        assert!(info.active);

        let resolved_address = client.resolve_by_did(&did);
        assert_eq!(resolved_address, identity);

        client.revoke_did(&identity);
        let info_revoked = client.resolve_did(&identity);
        assert!(!info_revoked.active);
    }

    #[test]
    #[should_panic(expected = "identity already registered")]
    fn test_duplicate_registration() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, IdentityRegistryDID);
        let client = IdentityRegistryDIDClient::new(&env, &contract_id);

        let identity = Address::generate(&env);
        let did1 = Symbol::new(&env, "did_fluid_1");
        let did2 = Symbol::new(&env, "did_fluid_2");
        let pubkey = BytesN::from_array(&env, &[0u8; 32]);

        client.register_did(&identity, &did1, &pubkey);
        client.register_did(&identity, &did2, &pubkey);
    }
}
