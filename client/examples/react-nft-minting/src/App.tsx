import React, { useState, useEffect } from 'react';
import {
  connectFreighter,
  signTransactionWithFreighter,
  isFreighterAvailable
} from '../../src/freighter';
import * as StellarSdk from 'stellar-sdk';
import './App.css';

interface NFTState {
  nftName: string;
  nftDescription: string;
  nftImageUrl: string;
  loading: boolean;
  error: string | null;
  success: boolean;
  tokenId: number | null;
  transactionHash: string | null;
  userPublicKey: string | null;
  freighterConnected: boolean;
}

function App() {
  const [state, setState] = useState<NFTState>({
    nftName: '',
    nftDescription: '',
    nftImageUrl: '',
    loading: false,
    error: null,
    success: false,
    tokenId: null,
    transactionHash: null,
    userPublicKey: null,
    freighterConnected: false,
  });

  // Environment variables
  const sorobanRpcUrl = import.meta.env.VITE_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
  const nftContractId = import.meta.env.VITE_NFT_CONTRACT_ID;
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

  const handleMintNFT = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!state.userPublicKey) {
      setState(prev => ({
        ...prev,
        error: 'Please connect your wallet first'
      }));
      return;
    }

    if (!state.nftName || !state.nftDescription) {
      setState(prev => ({
        ...prev,
        error: 'Please fill in all required fields'
      }));
      return;
    }

    if (!nftContractId) {
      setState(prev => ({
        ...prev,
        error: 'NFT contract ID not configured'
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

      // Prepare metadata JSON
      const metadata = JSON.stringify({
        name: state.nftName,
        description: state.nftDescription,
        image: state.nftImageUrl || 'https://via.placeholder.com/200',
      });

      // Build Soroban invocation transaction (simplified for demo)
      // In production, use soroban-client to properly build this
      const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: networkPassphrase,
        horizon: horizonServer,
      })
        .addOperation(
          StellarSdk.Operation.invokeHostFunction({
            func: StellarSdk.xdr.HostFunction.hostFunctionTypeInvokeContract([
              StellarSdk.nativeToScVal(nftContractId),
              StellarSdk.nativeToScVal('mint'),
              StellarSdk.nativeToScVal(state.userPublicKey),
              StellarSdk.nativeToScVal(metadata),
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

      // In production, you would parse the result to extract the token ID
      // For this demo, we'll use a placeholder
      const tokenId = 1; // Placeholder - in production, extract from contract result

      setState(prev => ({
        ...prev,
        loading: false,
        success: true,
        tokenId: tokenId,
        transactionHash: result.hash,
        error: null,
        nftName: '',
        nftDescription: '',
        nftImageUrl: '',
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'NFT minting failed';
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
          <h1>🖼️ Fluid Gasless NFT Minting</h1>
          <p>Mint an NFT with zero transaction fees</p>
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
          <form onSubmit={handleMintNFT}>
            <div className="form-group">
              <label htmlFor="nftName">NFT Name *</label>
              <input
                id="nftName"
                type="text"
                placeholder="My First Gasless NFT"
                value={state.nftName}
                onChange={(e) => setState(prev => ({
                  ...prev,
                  nftName: e.target.value
                }))}
                disabled={state.loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="nftDescription">Description *</label>
              <textarea
                id="nftDescription"
                placeholder="Describe your NFT..."
                rows={3}
                value={state.nftDescription}
                onChange={(e) => setState(prev => ({
                  ...prev,
                  nftDescription: e.target.value
                }))}
                disabled={state.loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="nftImageUrl">Image URL (optional)</label>
              <input
                id="nftImageUrl"
                type="url"
                placeholder="https://example.com/image.png"
                value={state.nftImageUrl}
                onChange={(e) => setState(prev => ({
                  ...prev,
                  nftImageUrl: e.target.value
                }))}
                disabled={state.loading}
              />
            </div>

            {state.nftName && state.nftDescription && (
              <div className="nft-preview">
                <h3>📸 Preview</h3>
                <p><strong>{state.nftName}</strong></p>
                <p>{state.nftDescription}</p>
              </div>
            )}

            {state.error && (
              <div className="alert alert-error" style={{ marginTop: '16px' }}>
                {state.error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              style={{ marginTop: '20px' }}
              disabled={state.loading || !state.nftName || !state.nftDescription}
            >
              {state.loading ? (
                <>
                  <span className="loading-spinner">⏳</span>
                  Minting...
                </>
              ) : (
                'Mint NFT (Gasless)'
              )}
            </button>
          </form>
        )}

        {state.success && state.transactionHash && (
          <div>
            <div className="alert alert-success">
              ✓ NFT minted successfully! Token #{state.tokenId}
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
                tokenId: null,
              }))}
            >
              Mint Another NFT
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
