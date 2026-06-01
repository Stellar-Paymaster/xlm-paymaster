import type { Transaction } from "@stellar/stellar-sdk";

/**
 * Operation types in the Stellar protocol that carry a destination address.
 * Each maps to a field name on the parsed operation object.
 */
const DESTINATION_OPS = new Set([
  "payment",
  "createAccount",
  "pathPaymentStrictReceive",
  "pathPaymentStrictSend",
  "accountMerge",
]);

/**
 * Extract all unique public-key addresses that appear in an inner transaction:
 *   - The transaction source account
 *   - Each operation's optional per-operation source override
 *   - The `destination` field on operations that have one
 *
 * Returns an array of unique StrKey addresses (G...).
 */
export function extractAddresses(tx: Transaction): string[] {
  const seen = new Set<string>();

  function add(addr: string | null | undefined) {
    if (addr && typeof addr === "string" && addr.length > 0) {
      seen.add(addr);
    }
  }

  // Transaction-level source account
  add(tx.source);

  for (const op of tx.operations as Array<Record<string, unknown>>) {
    // Per-operation source override
    add(op.source as string | undefined);

    // Destination on transfer/create operations
    if (typeof op.type === "string" && DESTINATION_OPS.has(op.type)) {
      add(op.destination as string | undefined);
    }
  }

  return Array.from(seen);
}
