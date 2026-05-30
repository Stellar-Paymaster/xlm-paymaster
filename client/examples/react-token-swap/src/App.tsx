import React, { useState, useEffect } from 'react';
import {
  connectFreighter,
  signTransactionWithFreighter,
  isFreighterAvailable
} from '../../src/freighter';
import * as StellarSdk from 'stellar-sdk';
import './App.css';

interface SwapState {
  usdcAmount: string;
  xlmQuote: string;
  loading: boolean;
  error: string | null;
  success: boolean;
  transactionHash: string | null;
  userPublicKey: string | null;
  freighterConnected: boolean;
}

function App() {
  const [state, setState] = useState<SwapState>({
    usdcAmount: '',
    xlmQuote: '',
    loading: false,
    error: null,
    success: false,
    transactionHash: null,
    userPublicKey: null,
    freighterConnected: false,
  });

  // Environment variables
  const sorobanRpcUrl = import.meta.env.VITE_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
  const soroswapRouterContract = import.meta.env.VITE_SOROSWAP_ROUTER_CONTRACT;
  const usdcContract = import.meta.env.VITE_USDC_CONTRACT;
  const fluidServerUrl = import.meta.env.VITE_FLUID_SERVER_URL || 'https://testnet.fluid.dev';
  const networkPassphrase = import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
  const stellarExpertUrl = import.meta.env.VITE_STELLAR_EXPERT_URL || 'https://stellar.expert/explorer/testnet';
  const horizonUrl = import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org';

  // Check Freighter availability on mount
  useEffect(() => {
    if (isFreighterAvailable()) {
      setState(prev => ({ ...prev, freighterConnected: true }));
    }
  }, []);

  // Simulate price quote calculation
  useEffect(() => {
    if (state.usdcAmount && !state.loading) {
      // Simple mock: 1 USDC ~= 1.2 XLM (demo purposes)
      const xlmAmount = (parseFloat(state.usdcAmount) * 1.2).toFixed(2);
      setState(prev => ({ ...prev, xlmQuote: xlmAmount }));
    }
  }, [state.usdcAmount]);

  const connectWallet = async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const publicKey = await connectFreighter();
      setState(prev => ({
        ...prev,
        userPublicKey: publicKey,
        loading: false,
        error: null,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setState(prev => ({
        ...prev,
        error: message,
        loading: false,
      }));
    }
  };

  const handleSwap = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!state.userPublicKey) {
      setState(prev => ({
        ...prev,
        error: 'Please connect your wallet first'
      }));
      return;
    }

    if (!state.usdcAmount) {
      setState(prev => ({
        ...prev,
        error: 'Please enter a swap amount'
      }));
      return;
    }

    if (!soroswapRouterContract || !usdcContract) {
      setState(prev => ({
        ...prev,
        error: 'Swap contracts not configured'
      }));
      return;
    }

    try {
      setState(prev => ({
        ...prev,
        loading: true,
        error: null,
        success: false
      }));

      const horizonServer = new StellarSdk.Horizon.Server(horizonUrl);
      const sorobanServer = new StellarSdk.SorobanRpc.Server(sorobanRpcUrl);

      // Get source account details
      const sourceAccount = await horizonServer.loadAccount(state.userPublicKey);

      // Build Soroban invocation for swap (simplified for demo)
      const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: networkPassphrase,
        horizon: horizonServer,
      })
        .addOperation(
          StellarSdk.Operation.invokeHostFunction({
            func: StellarSdk.xdr.HostFunction.hostFunctionTypeInvokeContract([
              StellarSdk.nativeToScVal(soroswapRouterContract),
              StellarSdk.nativeToScVal('swap_exact_tokens_for_tokens'),
              StellarSdk.nativeToScVal(state.usdcAmount),
              StellarSdk.nativeToScVal(state.xlmQuote),
              StellarSdk.nativeToScVal([usdcContract, 'native']),
              StellarSdk.nativeToScVal(state.userPublicKey),
            ]),
            auth: [],
          })
        )
        .setTimeout(300)
        .build();

      // Prepare transaction for Soroban
      const preparedTransaction = await sorobanServer.prepareTransaction(transaction);

      // Sign with Freighter
      const signedXdr = await signTransactionWithFreighter(
        preparedTransaction.toXDR(),
        networkPassphrase
      );

      // Request fee-bump from Fluid
      const response = await fetch(`${fluidServerUrl}/fee-bump`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionXdr: signedXdr,
          networkPassphrase: networkPassphrase,
        }),
      });

      if (!response.ok) {
        throw new Error('Fee-bump request failed: ' + (await response.text()));
      }

      const { feeBumpXdr, hash } = await response.json();

      // Submit to Horizon
      const result = await horizonServer.submitTransaction(
        StellarSdk.TransactionEnvelope.fromXDR(feeBumpXdr, networkPassphrase)
      );

      setState(prev => ({
        ...prev,
        loading: false,
        success: true,
        transactionHash: result.hash,
        error: null,
        usdcAmount: '',
        xlmQuote: '',
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Swap failed';
      setState(prev => ({
        ...prev,
        error: message,
        loading: false,
      }));
    }
  };

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <h1>💱 Fluid Gasless Token Swap</h1>
          <p>Swap USDC for XLM with zero fees</p>
        </div>

        {!state.freighterConnected && (
          <div className="alert alert-error">
            ⚠️ Freighter wallet not found. Please install the Freighter extension.
          </div>
        )}

        {state.userPublicKey && (
          <div className="wallet-status connected">
            ✓ Connected: {state.userPublicKey.slice(0, 8)}...{state.userPublicKey.slice(-8)}
          </div>
        )}

        {!state.userPublicKey && state.freighterConnected && (
          <button
            className="btn-primary"
            onClick={connectWallet}
            disabled={state.loading}
          >
            {state.loading ? 'Connecting...' : 'Connect Freighter Wallet'}
          </button>
        )}

        {state.userPublicKey && !state.success && (
          <form onSubmit={handleSwap}>
            <div className="swap-container">
              <div className="form-group">
                <label htmlFor="usdc-amount">You Send (USDC)</label>
                <input
                  id="usdc-amount"
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  value={state.usdcAmount}
                  onChange={(e) => setState(prev => ({
                    ...prev,
                    usdcAmount: e.target.value
                  }))}
                  disabled={state.loading}
                />
              </div>

              <div className="swap-row middle">
                <div className="swap-arrow">⬇️</div>
              </div>

              <div className="form-group">
                <label>You Receive (XLM)</label>
                <div className="token-display">
                  <strong>{state.xlmQuote || '0.00'} XLM</strong>
                  <span>Rate: 1 USDC ≈ 1.2 XLM</span>
                </div>
              </div>
            </div>

            {state.error && (
              <div className="alert alert-error">{state.error}</div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={state.loading || !state.usdcAmount}
            >
              {state.loading ? (
                <>
                  <span className="loading-spinner">⏳</span>
                  Processing...
                </>
              ) : (
                'Execute Swap (Gasless)'
              )}
            </button>
          </form>
        )}

        {state.success && state.transactionHash && (
          <div>
            <div className="alert alert-success">
              ✓ Swap completed! You received {state.xlmQuote} XLM for {state.usdcAmount} USDC.
            </div>
            <div className="alert alert-info">
              Transaction Hash:
              <br />
              <a
                href={`${stellarExpertUrl}/tx/${state.transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tx-link"
              >
                {state.transactionHash}
              </a>
            </div>
            <button
              className="btn-secondary"
              onClick={() => setState(prev => ({
                ...prev,
                success: false,
                transactionHash: null,
                error: null,
              }))}
            >
              Make Another Swap
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
