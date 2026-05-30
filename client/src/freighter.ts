/**
 * Freighter Wallet Integration Module
 * Provides utilities for connecting to Freighter wallet and signing transactions
 * Reference: https://github.com/stellar/freighter
 */

/**
 * Check if Freighter wallet is available in the browser
 */
export function isFreighterAvailable(): boolean {
  return typeof window !== 'undefined' && 'freighter' in window;
}

/**
 * Connect to Freighter and get the user's public key
 * @returns User's public key or throws error if Freighter not available/denied
 */
export async function connectFreighter(): Promise<string> {
  if (!isFreighterAvailable()) {
    throw new Error('Freighter wallet not found. Please install the Freighter extension.');
  }

  try {
    // Request public key from Freighter
    // @ts-ignore - Freighter injects window.freighter
    const publicKey = await window.freighter.getPublicKey();

    if (!publicKey) {
      throw new Error('Failed to get public key from Freighter');
    }

    return publicKey;
  } catch (error) {
    if (error instanceof Error && error.message.includes('User denied')) {
      throw new Error('User denied Freighter connection');
    }
    throw error;
  }
}

/**
 * Sign a transaction with Freighter
 * @param xdr Transaction envelope XDR string
 * @param networkPassphrase Network where transaction will be submitted
 * @returns Signed transaction envelope XDR
 */
export async function signTransactionWithFreighter(
  xdr: string,
  networkPassphrase: string
): Promise<string> {
  if (!isFreighterAvailable()) {
    throw new Error('Freighter wallet not found.');
  }

  try {
    // @ts-ignore - Freighter injects window.freighter
    const signedXdr = await window.freighter.signTransaction(xdr, {
      networkPassphrase,
    });

    if (!signedXdr) {
      throw new Error('Failed to sign transaction');
    }

    return signedXdr;
  } catch (error) {
    if (error instanceof Error && error.message.includes('User denied')) {
      throw new Error('User denied transaction signing');
    }
    throw error;
  }
}

/**
 * Verify Freighter is connected (convenience method)
 * @returns true if Freighter is available and user can connect
 */
export async function verifyFreighterConnection(): Promise<boolean> {
  try {
    await connectFreighter();
    return true;
  } catch {
    return false;
  }
}

/**
 * Type declarations for Freighter global
 */
declare global {
  interface Window {
    freighter?: {
      getPublicKey(): Promise<string>;
      signTransaction(
        xdr: string,
        options: { networkPassphrase: string }
      ): Promise<string>;
    };
  }
}
