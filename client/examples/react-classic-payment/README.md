# XLM Paymaster Gasless Classic Payment Demo

A minimal React demo showing gasless Stellar Classic XLM payments powered by XLM Paymaster.

## Features

- 💧 **Gasless Payments**: XLM Paymaster sponsors all transaction fees
- 👛 **Freighter Integration**: Connect your Stellar wallet
- 🔗 **Instant Settlement**: See your transaction on Stellar Expert
- 📱 **Responsive**: Works on desktop and mobile

## Requirements

- [Freighter Wallet](https://www.freighter.app/) browser extension installed
- Stellar testnet XLM in connected wallet (optional - XLM Paymaster covers fees)

## Environment Variables

```
VITE_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_FLUID_SERVER_URL=https://testnet.xlm-paymaster.dev
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
4. **XLM Paymaster Sponsorship**: XLM Paymaster wraps your transaction in a fee-bump, covering all fees
5. **Confirmation**: View your confirmed transaction on Stellar Expert

## Deployment

Deployed to: https://stellar-xlm-paymaster.github.io/react-classic-payment/

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
- **XLM Paymaster SDK**: Fee-bump sponsorship

## Support

For issues or questions:
1. Check [Freighter docs](https://github.com/stellar/freighter)
2. Review [XLM Paymaster SDK docs](https://github.com/Stellar-Paymaster/xlm-paymaster)
3. Check [Stellar documentation](https://developers.stellar.org/)
