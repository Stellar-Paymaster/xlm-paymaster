import { toTransactionXdr, fromTransactionXdr } from "./stellarCompatibility";

export interface OfflinePreparedTransaction {
  id: string;
  signedXdr: string;
  preparedAt: number;
  submit: boolean;
  networkPassphrase: string;
  metadata?: Record<string, unknown>;
}

export interface OfflinePrepareOptions {
  submit?: boolean;
  metadata?: Record<string, unknown>;
  now?: number;
}

const STORAGE_KEY = "fluid_offline_prepared_txns";

function generateId(): string {
  return `fluid_offline_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readStorage(storage: Pick<Storage, "getItem">): OfflinePreparedTransaction[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(
  storage: Pick<Storage, "setItem">,
  items: OfflinePreparedTransaction[],
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * Prepares a fully signed transaction XDR for offline storage.
 *
 * Call this while offline (or any time before submission). The returned
 * record is persisted to the provided storage and can later be retrieved
 * with {@link getPendingOfflineTransactions} for submission when back online.
 *
 * @param signedXdr - A fully signed transaction in XDR base-64 format.
 * @param networkPassphrase - The Stellar network passphrase used to sign.
 * @param storage - Any Storage-like adapter (e.g. localStorage).
 * @param options - Optional submit flag, metadata, and clock override for testing.
 */
export function prepareOfflineTransaction(
  signedXdr: string,
  networkPassphrase: string,
  storage: Pick<Storage, "getItem" | "setItem">,
  options: OfflinePrepareOptions = {},
): OfflinePreparedTransaction {
  const item: OfflinePreparedTransaction = {
    id: generateId(),
    signedXdr,
    preparedAt: options.now ?? Date.now(),
    submit: options.submit ?? false,
    networkPassphrase,
    metadata: options.metadata,
  };

  const existing = readStorage(storage);
  writeStorage(storage, [...existing, item]);

  return item;
}

/**
 * Returns all pending offline-prepared transactions from storage.
 */
export function getPendingOfflineTransactions(
  storage: Pick<Storage, "getItem">,
): OfflinePreparedTransaction[] {
  return readStorage(storage);
}

/**
 * Removes a single prepared transaction from storage by its ID.
 */
export function removePreparedTransaction(
  id: string,
  storage: Pick<Storage, "getItem" | "setItem">,
): void {
  const items = readStorage(storage).filter((item) => item.id !== id);
  writeStorage(storage, items);
}

/**
 * Removes all prepared transactions from storage.
 */
export function clearPreparedTransactions(
  storage: Pick<Storage, "setItem">,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify([]));
}

/**
 * Returns the number of pending offline transactions stored.
 */
export function getPendingCount(storage: Pick<Storage, "getItem">): number {
  return readStorage(storage).length;
}

/**
 * Validates that a stored XDR can be parsed back with the expected network
 * passphrase. Returns true when the XDR is well-formed, false otherwise.
 *
 * @param item - A prepared transaction record.
 * @param stellarSdk - The Stellar SDK instance to use for parsing.
 */
export function validatePreparedTransaction(
  item: OfflinePreparedTransaction,
  stellarSdk: unknown,
): boolean {
  try {
    fromTransactionXdr(stellarSdk, item.signedXdr, item.networkPassphrase);
    return true;
  } catch {
    return false;
  }
}

export { STORAGE_KEY as OFFLINE_TX_STORAGE_KEY };
