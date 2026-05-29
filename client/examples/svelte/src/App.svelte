<script lang="ts">
  import { onMount } from 'svelte';
  import StellarSdk from "@stellar/stellar-sdk";
  import { FluidClient } from "fluid-client";

  // Initialize Fluid client
  const client = new FluidClient({
    serverUrl: "http://localhost:3000",
    networkPassphrase: StellarSdk.Networks.TESTNET,
    horizonUrl: "https://horizon-testnet.stellar.org",
  });

  let transactionXdr = "";
  let statusMessage = "Initializing...";
  let isLoading = false;
  let error: any = null;
  let result: any = null;

  onMount(async () => {
    try {
      // Generate a random keypair for demo purposes
      const userKeypair = StellarSdk.Keypair.random();
      statusMessage = `User wallet: ${userKeypair.publicKey()}`;

      // Fund the wallet (only on testnet)
      statusMessage = "Funding wallet...";
      await fetch(`https://friendbot.stellar.org?addr=${userKeypair.publicKey()}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Load account
      const server = new StellarSdk.Horizon.Server("https://horizon-testnet.stellar.org");
      const account = await server.loadAccount(userKeypair.publicKey());

      // Build a sample transaction
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: StellarSdk.Keypair.random().publicKey(),
            asset: StellarSdk.Asset.native(),
            amount: "2.5",
          }),
        )
        .setTimeout(180)
        .build();

      // Sign transaction
      transaction.sign(userKeypair);

      // Store the XDR
      transactionXdr = transaction.toXDR();
      statusMessage = "Transaction ready for fee-bump!";
    } catch (err) {
      statusMessage = `Initialization failed: ${err instanceof Error ? err.message : "Unknown error"}`;
      console.error(err);
    }
  });

  async function handleRequestFeeBump() {
    if (!transactionXdr) return;

    isLoading = true;
    error = null;
    result = null;

    try {
      statusMessage = "Requesting fee bump...";
      result = await client.requestFeeBump(transactionXdr, false);
      statusMessage = "Fee bump successful!";
    } catch (err: any) {
      error = err;
      statusMessage = "Fee bump failed.";
    } finally {
      isLoading = false;
    }
  }
</script>

<main>
  <div class="glass-card">
    <h1>Fluid Svelte</h1>
    <p class="subtitle">Experience gasless Stellar transactions</p>

    <div class="status-badge {error ? 'error' : result ? 'success' : 'info'}">
      {statusMessage}
    </div>

    <div class="field-group">
      <label for="xdr">Transaction XDR</label>
      <textarea 
        id="xdr" 
        bind:value={transactionXdr} 
        readonly 
        placeholder="Waiting for transaction generation..."
      ></textarea>
    </div>

    <button 
      on:click={handleRequestFeeBump} 
      disabled={isLoading || !transactionXdr}
      class:loading={isLoading}
    >
      {#if isLoading}
        <span class="spinner"></span> Processing...
      {:else}
        Request Fee Bump
      {/if}
    </button>

    {#if result}
      <div class="result-area animate-fade-in">
        <h3>Success!</h3>
        <div class="data-grid">
          <div class="data-item">
            <span class="label">Status</span>
            <span class="value">{result.status}</span>
          </div>
          {#if result.hash}
            <div class="data-item">
              <span class="label">Hash</span>
              <span class="value truncated">{result.hash}</span>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#if error}
      <div class="error-area animate-shake">
        <h3>Error</h3>
        <p>{error.message}</p>
        {#if error.status}
          <p class="error-detail">Code: {error.status}</p>
        {/if}
      </div>
    {/if}
  </div>
</main>

<style>
  :global(body) {
    background: radial-gradient(circle at top right, #1a1a2e, #16213e);
    color: #e94560;
  }

  main {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
  }

  .glass-card {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 24px;
    padding: 40px;
    width: 100%;
    max-width: 500px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  }

  h1 {
    margin: 0;
    font-size: 2.5rem;
    font-weight: 800;
    background: linear-gradient(to right, #e94560, #0f3460);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .subtitle {
    color: #94a3b8;
    margin-bottom: 30px;
  }

  .status-badge {
    padding: 8px 16px;
    border-radius: 99px;
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 24px;
    display: inline-block;
  }

  .info { background: rgba(59, 130, 246, 0.1); color: #60a5fa; }
  .success { background: rgba(34, 197, 94, 0.1); color: #4ade80; }
  .error { background: rgba(239, 68, 68, 0.1); color: #f87171; }

  .field-group {
    text-align: left;
    margin-bottom: 24px;
  }

  label {
    display: block;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    margin-bottom: 8px;
    margin-left: 4px;
  }

  textarea {
    width: 100%;
    height: 100px;
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 12px;
    color: #f1f5f9;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    resize: none;
    transition: border-color 0.2s;
  }

  textarea:focus {
    outline: none;
    border-color: #e94560;
  }

  button {
    width: 100%;
    padding: 16px;
    background: #e94560;
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
  }

  button:hover:not(:disabled) {
    background: #ff5e78;
    transform: translateY(-2px);
    box-shadow: 0 10px 15px -3px rgba(233, 69, 96, 0.3);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .result-area {
    margin-top: 30px;
    padding: 20px;
    background: rgba(34, 197, 94, 0.05);
    border-radius: 16px;
    border: 1px solid rgba(34, 197, 94, 0.2);
    text-align: left;
  }

  .result-area h3 { margin-top: 0; color: #4ade80; }

  .data-grid { display: flex; flex-direction: column; gap: 12px; }
  .data-item { display: flex; flex-direction: column; }
  .data-item .label { font-size: 0.7rem; color: #64748b; text-transform: uppercase; }
  .data-item .value { color: #f1f5f9; font-family: monospace; }
  .truncated { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .error-area {
    margin-top: 30px;
    padding: 20px;
    background: rgba(239, 68, 68, 0.05);
    border-radius: 16px;
    border: 1px solid rgba(239, 68, 68, 0.2);
    text-align: left;
  }

  .error-area h3 { margin-top: 0; color: #f87171; }
  .error-detail { font-size: 0.75rem; color: #94a3b8; }

  .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
  .animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes shake {
    10%, 90% { transform: translate3d(-1px, 0, 0); }
    20%, 80% { transform: translate3d(2px, 0, 0); }
    30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
    40%, 60% { transform: translate3d(4px, 0, 0); }
  }
</style>
