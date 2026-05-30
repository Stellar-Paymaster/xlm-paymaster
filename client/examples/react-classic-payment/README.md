# Fluid Gasless Classic Payment Demo

A minimal React demo showing gasless Stellar Classic XLM payments powered by Fluid.

## Features

- 💧 **Gasless Payments**: Fluid sponsors all transaction fees
- 👛 **Freighter Integration**: Connect your Stellar wallet
- 🔗 **Instant Settlement**: See your transaction on Stellar Expert
- 📱 **Responsive**: Works on desktop and mobile

## Requirements

- [Freighter Wallet](https://www.freighter.app/) browser extension installed
- Stellar testnet XLM in connected wallet (optional - Fluid covers fees)

## Environment Variables

```
VITE_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_FLUID_SERVER_URL=https://testnet.fluid.dev
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_STELLAR_EXPERT_URL=https://stellar.expert/explorer/testnet
```

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## How It Works

1. **Connect Wallet**: Click "Connect Freighter Wallet" to authorize the app
2. **Enter Details**: Specify destination address and XLM amount
3. **Sign Transaction**: Freighter wallet prompts for transaction signature
4. **Fluid Sponsorship**: Fluid wraps your transaction in a fee-bump, covering all fees
5. **Confirmation**: View your confirmed transaction on Stellar Expert

## Deployment

Deployed to: https://stellar-fluid.github.io/react-classic-payment/

Automatically deployed on push to `main` branch via GitHub Actions.

## Testing Checklist

- [ ] Connect Freighter wallet
- [ ] Enter valid destination address
- [ ] Enter XLM amount
- [ ] Submit payment
- [ ] Freighter signature prompt appears
- [ ] Transaction submitted successfully
- [ ] Transaction visible in Stellar Expert
- [ ] Destination account receives funds

## Technical Stack

- **React 18**: UI framework
- **Vite**: Build tool
- **TypeScript**: Type safety
- **Stellar SDK**: Blockchain integration
- **Freighter API**: Wallet connection
- **Fluid SDK**: Fee-bump sponsorship

## Support

For issues or questions:
1. Check [Freighter docs](https://github.com/stellar/freighter)
2. Review [Fluid SDK docs](https://github.com/stellar-fluid/fluid)
3. Check [Stellar documentation](https://developers.stellar.org/)
