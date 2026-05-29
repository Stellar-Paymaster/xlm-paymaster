# Fluid Gasless NFT Minting Demo

A React demo showing gasless Soroban NFT minting powered by Fluid.

## Features

- 💧 **Gasless Minting**: Fluid sponsors all transaction fees
- 👛 **Freighter Integration**: Connect your Stellar wallet
- 🎨 **NFT Metadata**: Add name, description, and image
- 🔗 **Instant Settlement**: See your transaction on Stellar Expert
- 📱 **Responsive**: Works on desktop and mobile

## Requirements

- [Freighter Wallet](https://www.freighter.app/) browser extension installed
- Stellar testnet (Freighter will be in testnet mode)
- NFT contract deployed on Soroban testnet

## Environment Variables

```
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_NFT_CONTRACT_ID=<deployed-contract-id>
VITE_FLUID_SERVER_URL=https://testnet.fluid.dev
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_STELLAR_EXPERT_URL=https://stellar.expert/explorer/testnet
VITE_HORIZON_URL=https://horizon-testnet.stellar.org
```

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Deploy to Vercel
npm run deploy
```

## How It Works

1. **Connect Wallet**: Click "Connect Freighter Wallet" to authorize the app
2. **Enter NFT Details**: Specify name, description, and optional image URL
3. **Preview**: See how your NFT will appear
4. **Sign Transaction**: Freighter wallet prompts for transaction signature
5. **Fluid Sponsorship**: Fluid wraps your transaction in a fee-bump, covering all fees
6. **Confirmation**: View your confirmed transaction on Stellar Expert

## Deployment

Deployed to Vercel: https://fluid-nft-demo.vercel.app/

Set environment variables in Vercel dashboard:
- `VITE_SOROBAN_RPC_URL`
- `VITE_NFT_CONTRACT_ID`
- `VITE_FLUID_SERVER_URL`
- `VITE_NETWORK_PASSPHRASE`
- `VITE_STELLAR_EXPERT_URL`
- `VITE_HORIZON_URL`

## Testing Checklist

- [ ] Connect Freighter wallet
- [ ] Enter NFT name and description
- [ ] Enter optional image URL
- [ ] Preview shows correctly
- [ ] Submit minting request
- [ ] Freighter signature prompt appears
- [ ] Transaction submitted successfully
- [ ] Transaction visible in Stellar Expert
- [ ] Token ID received in response

## Technical Stack

- **React 18**: UI framework
- **Vite**: Build tool
- **TypeScript**: Type safety
- **Stellar SDK**: Blockchain integration
- **Freighter API**: Wallet connection
- **Soroban**: Smart contract platform
- **Fluid SDK**: Fee-bump sponsorship

## Contract Integration

The demo expects an NFT contract with these functions:

```
mint(recipient: Address, metadata: String) -> u32
get_metadata(token_id: u32) -> String
get_owner(token_id: u32) -> Address
get_total_supply() -> u32
```

## Support

For issues or questions:
1. Check [Freighter docs](https://github.com/stellar/freighter)
2. Review [Soroban docs](https://soroban.stellar.org/)
3. Check [Fluid SDK docs](https://github.com/stellar-fluid/fluid)
4. Check [Stellar documentation](https://developers.stellar.org/)
