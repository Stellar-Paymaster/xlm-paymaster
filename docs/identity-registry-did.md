# Identity Registry (DID) Contract

The `IdentityRegistryDID` contract implements decentralized identity (DID) registration on Soroban. It supports direct registration (paid by the identity owner) as well as sponsored gasless registration where a relayer submits the transaction using a user's cryptographic signature.

## Methods

### `register_did(env: Env, identity: Address, did: Symbol, identity_pubkey: BytesN<32>)`
Directly registers a DID document. Requires identity owner authentication.
- **identity**: Address of the user registering the identity.
- **did**: The decentralized identity string representation (e.g. `did:fluid:123`).
- **identity_pubkey**: User's public key associated with the DID.

### `register_did_sponsored(env: Env, identity: Address, did: Symbol, identity_pubkey: BytesN<32>, signature: BytesN<64>)`
Allows sponsored (gasless) DID registration via a relayer.
- **identity**: Address of the identity being registered.
- **did**: The decentralized identity string representation.
- **identity_pubkey**: Public key associated with the DID.
- **signature**: user's cryptographic signature authorizing the registration of `did` and `identity_pubkey`.

### `resolve_did(env: Env, identity: Address) -> DIDInfo`
Resolves user address to their active DID registration.

### `resolve_by_did(env: Env, did: Symbol) -> Address`
Looks up the address of a user by their registered DID string.

### `revoke_did(env: Env, identity: Address)`
Revokes user's active DID registration. Requires identity owner authentication.
