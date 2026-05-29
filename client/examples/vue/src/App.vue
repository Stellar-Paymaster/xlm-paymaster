<script setup lang="ts">
import { ref, onMounted } from "vue";
import StellarSdk from "@stellar/stellar-sdk";
import {
  FluidClient,
  KeypairSigner,
  WalletConnectSigner,
  buildStellarRequiredNamespaces,
  STELLAR_CHAINS,
  type WalletSigner,
} from "fluid-client";

const NETWORK = StellarSdk.Networks.TESTNET;

// Initialize Fluid client
const client = new FluidClient({
  serverUrl: "http://localhost:3000",
  networkPassphrase: NETWORK,
  horizonUrl: "https://horizon-testnet.stellar.org",
});

// Local state for the example
const transactionXdr = ref("");
const statusMessage = ref("");
const isLoading = ref(false);
const error = ref<Error | null>(null);
const result = ref<{ status: string; xdr: string; hash?: string } | null>(null);

// Signer selection: which wallet binding produces the signature.
const signerType = ref<"keypair" | "walletconnect">("keypair");
const walletAddress = ref("");

// The unsigned transaction we will hand to the wallet for universal signing.
let unsignedTransaction: StellarSdk.Transaction | null = null;
// The in-process keypair backing the "keypair" signer in this demo.
let demoKeypair: StellarSdk.Keypair | null = null;

// The namespaces an app requests when opening a real WalletConnect session.
const requiredNamespaces = buildStellarRequiredNamespaces({
  chains: [STELLAR_CHAINS.TESTNET],
});

// Create a sample (unsigned) transaction on mount.
onMounted(async () => {
  try {
    demoKeypair = StellarSdk.Keypair.random();
    walletAddress.value = demoKeypair.publicKey();
    console.log("User wallet:", demoKeypair.publicKey());

    // Fund the wallet (only on testnet)
    statusMessage.value = "Funding wallet...";
    await fetch(`https://friendbot.stellar.org?addr=${demoKeypair.publicKey()}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Load account
    const server = new StellarSdk.Horizon.Server(
      "https://horizon-testnet.stellar.org",
    );
    const account = await server.loadAccount(demoKeypair.publicKey());

    // Build a sample transaction (left UNSIGNED — the wallet signs it).
    unsignedTransaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: StellarSdk.Keypair.random().publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: "1",
        }),
      )
      .setTimeout(180)
      .build();

    transactionXdr.value = unsignedTransaction.toXDR();
    statusMessage.value = "Unsigned transaction created. Pick a signer below.";
  } catch (err) {
    statusMessage.value = `Error creating transaction: ${err instanceof Error ? err.message : "Unknown error"}`;
    console.error("Error:", err);
  }
});

/**
 * Resolve the selected wallet binding to a universal `WalletSigner`.
 *
 * Both branches return the same interface, so the rest of the flow is
 * identical regardless of how the user chooses to sign.
 */
function resolveSigner(): WalletSigner {
  if (signerType.value === "walletconnect") {
    // In a real app, open a WalletConnect session with `requiredNamespaces`
    // above, then build the signer from the connected provider + session:
    //
    //   const signClient = await SignClient.init({ projectId });
    //   const { uri, approval } = await signClient.connect({ requiredNamespaces });
    //   const session = await approval();
    //   return createWalletConnectSigner(signClient, session, {
    //     networkPassphrase: NETWORK,
    //   });
    //
    // A globally-wired provider/session is used here when available.
    const provider = (window as any).fluidWalletConnectProvider;
    const session = (window as any).fluidWalletConnectSession;
    if (!provider || !session) {
      throw new Error(
        "No WalletConnect session wired. See requiredNamespaces and the inline " +
          "instructions to connect a real wallet, or use the keypair signer.",
      );
    }
    return new WalletConnectSigner({
      provider,
      topic: session.topic,
      address: walletAddress.value,
      networkPassphrase: NETWORK,
    });
  }

  if (!demoKeypair) {
    throw new Error("Demo keypair not ready");
  }
  return new KeypairSigner(demoKeypair, NETWORK);
}

// Sign with the selected wallet binding, then request a fee bump.
async function handleRequestFeeBump() {
  if (!unsignedTransaction) {
    statusMessage.value = "No transaction available";
    return;
  }

  isLoading.value = true;
  error.value = null;
  try {
    const signer = resolveSigner();
    statusMessage.value = `Signing with "${signer.id}" and requesting fee bump...`;
    result.value = await client.buildAndRequestFeeBumpWithWallet(
      signer,
      unsignedTransaction,
      false,
    );
    statusMessage.value = "Fee bump requested successfully!";
  } catch (err) {
    error.value = err instanceof Error ? err : new Error("Unknown error");
    statusMessage.value = `Error: ${error.value.message}`;
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="container">
    <h1>Fluid Vue Example</h1>

    <div class="status">
      <p><strong>Status:</strong> {{ statusMessage }}</p>
    </div>

    <div class="card">
      <h2>Unsigned Transaction XDR</h2>
      <textarea
        v-model="transactionXdr"
        readonly
        placeholder="Transaction XDR will appear here..."
        rows="4"
      ></textarea>
    </div>

    <div class="card">
      <h2>Wallet Signer</h2>
      <p>Pick which standard wallet binding signs this transaction:</p>
      <label class="radio">
        <input type="radio" value="keypair" v-model="signerType" />
        In-process keypair (demo)
      </label>
      <label class="radio">
        <input type="radio" value="walletconnect" v-model="signerType" />
        WalletConnect
      </label>
      <p v-if="walletAddress" class="muted">
        Signer address: <code>{{ walletAddress }}</code>
      </p>
    </div>

    <div v-if="signerType === 'walletconnect'" class="card">
      <h2>WalletConnect <code>requiredNamespaces</code></h2>
      <p class="muted">
        Pass this to <code>signClient.connect(...)</code> to open a Stellar
        session, then build a <code>WalletConnectSigner</code> from the result.
      </p>
      <textarea readonly rows="8" :value="JSON.stringify(requiredNamespaces, null, 2)"></textarea>
    </div>

    <div class="card">
      <h2>Sign &amp; Request Fee Bump</h2>
      <button
        @click="handleRequestFeeBump"
        :disabled="isLoading || !transactionXdr"
        class="btn"
      >
        {{ isLoading ? "Signing & requesting..." : "Sign & Request Fee Bump" }}
      </button>
    </div>

    <div v-if="isLoading" class="card loading">
      <p>Loading...</p>
    </div>

    <div v-if="error" class="card error">
      <h2>Error</h2>
      <p>{{ error.message }}</p>
    </div>

    <div v-if="result" class="card success">
      <h2>Fee Bump Result</h2>
      <p><strong>Status:</strong> {{ result.status }}</p>
      <p v-if="result.hash"><strong>Hash:</strong> {{ result.hash }}</p>
      <p><strong>XDR:</strong></p>
      <textarea readonly :value="result.xdr" rows="4"></textarea>
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

h1 {
  color: #333;
  text-align: center;
}

.card {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.card h2 {
  margin-top: 0;
  color: #555;
}

textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  resize: vertical;
}

.btn {
  background: #007bff;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  width: 100%;
}

.btn:hover:not(:disabled) {
  background: #0056b3;
}

.btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.status {
  background: #e7f3ff;
  border-left: 4px solid #007bff;
  padding: 15px;
  margin-bottom: 20px;
}

.radio {
  display: block;
  margin: 8px 0;
  cursor: pointer;
}

.muted {
  color: #777;
  font-size: 0.9em;
}

code {
  background: #eaeaea;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.9em;
}

.loading {
  background: #fff3cd;
  border-left: 4px solid #ffc107;
}

.error {
  background: #f8d7da;
  border-left: 4px solid #dc3545;
}

.success {
  background: #d4edda;
  border-left: 4px solid #28a745;
}
</style>
