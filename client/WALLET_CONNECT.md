# Universal Wallet Signing (WalletConnect Standard Bindings)

The Fluid client ships a wallet-agnostic signing layer so example applications
can sign gasless fee-bump payloads with **any** Stellar wallet — WalletConnect
sessions, SEP-43 browser wallets (Freighter, Albedo, xBull, the Stellar Wallets
Kit), or an in-process keypair — behind a single interface.

> All code lives in [`client/src/wallet`](./src/wallet). It adds **no new runtime
> dependencies**: the WalletConnect provider is injected, keeping the bundle
> small and tree-shakeable.

## The `WalletSigner` contract

Every binding implements the same interface (mirroring the SEP-43 standard
wallet shape):

```ts
interface WalletSigner {
  readonly id: string;
  getAddress(): Promise<{ address: string }>;
  signTransaction(
    transaction: string | { toXDR(): string },
    options?: {
      networkPassphrase?: string;
      address?: string;
      submit?: boolean;
    },
  ): Promise<{ signedTxXdr: string; signerAddress?: string }>;
}
```

Because the contract is uniform, the fee-bump flow is identical regardless of
which wallet the user picked:

```ts
const response = await client.buildAndRequestFeeBumpWithWallet(signer, unsignedTx);
```

## WalletConnect bindings

The standard Stellar WalletConnect namespace is implemented out of the box:

| Concept  | Value                                            |
| -------- | ------------------------------------------------ |
| Namespace | `stellar`                                       |
| Methods   | `stellar_signXDR`, `stellar_signAndSubmitXDR`   |
| Chains    | `stellar:pubnet`, `stellar:testnet`             |
| Accounts  | `stellar:<network>:<G-address>`                 |

### Connecting a wallet

```ts
import SignClient from "@walletconnect/sign-client";
import {
  buildStellarRequiredNamespaces,
  createWalletConnectSigner,
  STELLAR_CHAINS,
} from "fluid-client";

const signClient = await SignClient.init({ projectId: "<your-project-id>" });

const { uri, approval } = await signClient.connect({
  requiredNamespaces: buildStellarRequiredNamespaces({
    chains: [STELLAR_CHAINS.TESTNET],
  }),
});
// → render `uri` as a QR code, then await the wallet approval
const session = await approval();

const signer = createWalletConnectSigner(signClient, session, {
  networkPassphrase: StellarSdk.Networks.TESTNET,
});
```

### Signing + fee bump

```ts
const client = new FluidClient({
  serverUrl: "http://localhost:3000",
  networkPassphrase: StellarSdk.Networks.TESTNET,
});

// Sign through the wallet, then fee-bump the signed envelope in one call:
const response = await client.buildAndRequestFeeBumpWithWallet(signer, unsignedTx);

// Or sign first and submit yourself:
const { signedTxXdr } = await client.signWithWallet(signer, unsignedTx);
```

Pass `{ submit: true }` to route through `stellar_signAndSubmitXDR` instead of
`stellar_signXDR`:

```ts
await client.buildAndRequestFeeBumpWithWallet(signer, unsignedTx, false, {
  submit: true,
});
```

## Other signers

### In-process keypair

For Node demos, tests, and trusted backends:

```ts
import { KeypairSigner } from "fluid-client";

const signer = new KeypairSigner(keypair, StellarSdk.Networks.TESTNET);
```

### SEP-43 browser wallets

Adapt any wallet that already speaks the SEP-43 `signTransaction` interface
(Freighter, the Stellar Wallets Kit, …):

```ts
import { Sep43WalletSigner } from "fluid-client";

const signer = new Sep43WalletSigner(window.freighterApi, {
  id: "freighter",
  networkPassphrase: StellarSdk.Networks.TESTNET,
});
```

## API reference

### Client methods

- `client.signWithWallet(signer, transaction, options?)` → `{ signedTxXdr, signerAddress? }`
- `client.buildAndRequestFeeBumpWithWallet(signer, transaction, submit?, options?)` → `FeeBumpResponse`

### WalletConnect helpers

- `buildStellarRequiredNamespaces({ chains?, methods?, events? })`
- `parseStellarAccounts(session, chainId?)` → `{ chainId, address }[]`
- `createWalletConnectSigner(provider, session, { networkPassphrase | chainId, address? })`
- `extractSignedXdr(result)` — normalizes `{ signedXDR }` / `{ signedTxXdr }` / `{ xdr }` / bare string
- `chainIdForPassphrase(passphrase)` / `passphraseForChainId(chainId)`

### Signers

- `WalletConnectSigner` — WalletConnect session
- `KeypairSigner` — in-process keypair
- `Sep43WalletSigner` — SEP-43 browser wallet adapter

### Constants

- `STELLAR_NAMESPACE`, `STELLAR_METHODS`, `STELLAR_CHAINS`, `STELLAR_PASSPHRASES`

## Examples

- **Node:** `npm run demo:wallet-connect` — runs
  [`src/examples/walletConnectSigning.ts`](./src/examples/walletConnectSigning.ts),
  signing through both a (mock) WalletConnect session and an in-process keypair.
- **Browser:** [`examples/walletconnect.html`](./examples/walletconnect.html) — a
  no-build `<script>`-tag demo (build the bundle first with
  `npm run build:standalone`).
- **Vue:** [`examples/vue`](./examples/vue) — adds a signer selector that routes
  signing through the universal `WalletSigner` interface.

## Tests

Unit and integration coverage lives in
[`src/wallet/__tests__`](./src/wallet/__tests__):

```bash
npm test            # full suite
npx vitest run src/wallet
```
