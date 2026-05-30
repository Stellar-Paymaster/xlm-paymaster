# Fluid Gasless Token Swap Demo

A React demo showing gasless token swaps on Soroswap DEX powered by Fluid.

## Features

- 💧 **Gasless Swaps**: Fluid sponsors all transaction fees
- 👛 **Freighter Integration**: Connect your Stellar wallet
- 💱 **AMM Powered**: Uses Soroswap liquidity pools
- 🔗 **Instant Settlement**: See your transaction on Stellar Expert
- 📱 **Responsive**: Works on desktop and mobile

## Requirements

- [Freighter Wallet](https://www.freighter.app/) browser extension installed
- Stellar testnet USDC (or XLM to swap)
- Soroswap testnet infrastructure

## Environment Variables

```
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_SOROSWAP_ROUTER_CONTRACT=<router-contract-id>
VITE_USDC_CONTRACT=<usdc-contract-id>
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

1. **Connect Wallet**: Click "Connect Freighter Wallet" to authorize
2. **Enter Amount**: Specify how much USDC you want to swap
3. **See Quote**: View the XLM quote from Soroswap
4. **Execute Swap**: Sign transaction with Freighter
5. **Fluid Sponsorship**: Fluid wraps transaction in fee-bump, covering all fees
6. **Confirmation**: View your confirmed swap on Stellar Expert

## Deployment

Deployed to Vercel: https://fluid-swap-demo.vercel.app/

Set environment variables in Vercel dashboard:
- `VITE_SOROBAN_RPC_URL`
- `VITE_SOROSWAP_ROUTER_CONTRACT`
- `VITE_USDC_CONTRACT`
- `VITE_FLUID_SERVER_URL`
- `VITE_NETWORK_PASSPHRASE`
- `VITE_STELLAR_EXPERT_URL`
- `VITE_HORIZON_URL`

## Testing Checklist

- [ ] Connect Freighter wallet
- [ ] Enter USDC swap amount
- [ ] See XLM quote update
- [ ] Execute swap
- [ ] Freighter signature prompt appears
- [ ] Transaction submitted successfully
- [ ] Transaction visible in Stellar Expert
- [ ] XLM received in wallet

## Technical Stack

- **React 18**: UI framework
- **Vite**: Build tool
- **TypeScript**: Type safety
- **Stellar SDK**: Blockchain integration
- **Freighter API**: Wallet connection
- **Soroban**: Smart contract platform
- **Soroswap SDK**: AMM integration
- **Fluid SDK**: Fee-bump sponsorship

## Soroswap Integration

The demo uses Soroswap contracts for:
- `swap_exact_tokens_for_tokens` - Swap USDC for XLM with slippage protection
- Automatic price discovery from liquidity pools
- Fee-less execution through Fluid sponsorship

## Support

For issues or questions:
1. Check [Freighter docs](https://github.com/stellar/freighter)
2. Review [Soroswap docs](https://soroswap.soroban.stellar.org/)
3. Check [Stellar documentation](https://developers.stellar.org/)
4. Check [Fluid SDK docs](https://github.com/stellar-fluid/fluid)
