import React, { useState, useEffect } from 'react';
import {
  connectFreighter,
  signTransactionWithFreighter,
  isFreighterAvailable
} from '../../src/freighter';
import { FluidClient } from '@fluid-sdk/client';
import * as StellarSdk from 'stellar-sdk';
import './App.css';

interface PaymentState {
  destinationAddress: string;
  amount: string;
  loading: boolean;
  error: string | null;
  success: boolean;
  transactionHash: string | null;
  userPublicKey: string | null;
  freighterConnected: boolean;
}

function App() {
  const [state, setState] = useState<PaymentState>({
    destinationAddress: '',
    amount: '',
    loading: false,
    error: null,
    success: false,
    transactionHash: null,
    userPublicKey: null,
    freighterConnected: false,
  });

  // Environment variables
  const horizonUrl = import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org';
  const fluidServerUrl = import.meta.env.VITE_FLUID_SERVER_URL || 'https://testnet.fluid.dev';
  const networkPassphrase = import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
  const stellarExpertUrl = import.meta.env.VITE_STELLAR_EXPERT_URL || 'https://stellar.expert/explorer/testnet';

  // Check Freighter availability on mount
  useEffect(() => {
    if (isFreighterAvailable()) {
      setState(prev => ({ ...prev, freighterConnected: true }));
    }
  }, []);

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

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!state.userPublicKey) {
      setState(prev => ({
        ...prev,
        error: 'Please connect your wallet first'
      }));
      return;
    }

    if (!state.destinationAddress || !state.amount) {
      setState(prev => ({
        ...prev,
        error: 'Please fill in all fields'
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
      const fluidClient = new FluidClient({
        serverUrl: fluidServerUrl,
        horizonUrl: horizonUrl,
      });

      // Get source account details
      const sourceAccount = await horizonServer.loadAccount(state.userPublicKey);

      // Build the payment operation
      const paymentOp = StellarSdk.Operation.payment({
        destination: state.destinationAddress,
        asset: StellarSdk.Asset.native(),
        amount: state.amount,
      });

      // Build transaction
      const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: networkPassphrase,
        horizon: horizonServer,
      })
        .addOperation(paymentOp)
        .setTimeout(300)
        .build();

      // Sign with Freighter
      const signedXdr = await signTransactionWithFreighter(
        transaction.toXDR(),
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
        destinationAddress: '',
        amount: '',
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed';
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
          <h1>💧 Fluid Gasless Payment</h1>
          <p>Send XLM with zero transaction fees</p>
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
          <form onSubmit={handlePayment}>
            <div className="form-group">
              <label htmlFor="destination">Destination Address</label>
              <input
                id="destination"
                type="text"
                placeholder="G..."
                value={state.destinationAddress}
                onChange={(e) => setState(prev => ({
                  ...prev,
                  destinationAddress: e.target.value
                }))}
                disabled={state.loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="amount">Amount (XLM)</label>
              <input
                id="amount"
                type="number"
                placeholder="0.00"
                step="0.01"
                value={state.amount}
                onChange={(e) => setState(prev => ({
                  ...prev,
                  amount: e.target.value
                }))}
                disabled={state.loading}
              />
            </div>

            {state.error && (
              <div className="alert alert-error">{state.error}</div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={state.loading || !state.destinationAddress || !state.amount}
            >
              {state.loading ? (
                <>
                  <span className="loading-spinner">⏳</span>
                  Processing...
                </>
              ) : (
                'Send XLM (Gasless)'
              )}
            </button>
          </form>
        )}

        {state.success && state.transactionHash && (
          <div>
            <div className="alert alert-success">
              ✓ Transaction confirmed! Your XLM has been sent.
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
              Send Another Payment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
