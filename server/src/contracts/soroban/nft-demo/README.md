# Fluid NFT Demo Contract

A minimal Soroban smart contract for minting NFTs with metadata.

## Functions

### `mint(recipient: Address, metadata: String) -> u32`
Mints a new NFT and returns the token ID.

- **recipient**: Address that will own the NFT
- **metadata**: JSON string containing NFT metadata (name, description, image URL, etc.)
- **Returns**: Token ID (sequential starting from 1)

### `get_metadata(token_id: u32) -> String`
Retrieves the metadata for a given token ID.

### `get_owner(token_id: u32) -> Address`
Retrieves the owner address of a given token ID.

### `get_total_supply() -> u32`
Retrieves the total number of minted NFTs.

## Build

```bash
cd /Users/aliphatic/Desktop/fluid/server/src/contracts/soroban/nft-demo
soroban contract build
```

## Deploy

```bash
# Deploy to Testnet
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/fluid_nft_demo.wasm \
  --source <SOURCE_ACCOUNT> \
  --network testnet
```

## Testing

```bash
soroban contract test
```

## Example Usage

```javascript
const client = new ContractClient(nftContractId);

// Mint an NFT
const tokenId = await client.call('mint', [
  recipient,
  JSON.stringify({
    name: 'My First NFT',
    description: 'Minted with Fluid',
    image: 'https://example.com/image.png'
  })
]);

// Get metadata
const metadata = await client.call('get_metadata', [tokenId]);

// Get owner
const owner = await client.call('get_owner', [tokenId]);

// Get total supply
const totalSupply = await client.call('get_total_supply', []);
```
