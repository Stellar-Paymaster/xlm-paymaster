export type OperationType = "payment" | "create_account" | "manage_data";

export interface SandboxTransactionFields {
  sourceAccount: string;
  destinationAccount: string;
  amount: string;
  asset: string;
  operationType: OperationType;
  memo: string;
  fee: string;
  networkPassphrase: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof SandboxTransactionFields, string>>;
}

export interface BuildResult {
  xdr: string;
  summary: string;
}

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

export function validateTransactionFields(
  fields: SandboxTransactionFields
): ValidationResult {
  const errors: Partial<Record<keyof SandboxTransactionFields, string>> = {};

  if (!STELLAR_ADDRESS_RE.test(fields.sourceAccount)) {
    errors.sourceAccount = "Invalid Stellar public key";
  }

  if (
    fields.operationType !== "manage_data" &&
    !STELLAR_ADDRESS_RE.test(fields.destinationAccount)
  ) {
    errors.destinationAccount = "Invalid Stellar public key";
  }

  if (fields.operationType !== "manage_data") {
    const amt = parseFloat(fields.amount);
    if (isNaN(amt) || amt <= 0) {
      errors.amount = "Amount must be a positive number";
    }
  }

  const fee = parseInt(fields.fee, 10);
  if (isNaN(fee) || fee < 100) {
    errors.fee = "Fee must be at least 100 stroops";
  }

  if (!fields.networkPassphrase.trim()) {
    errors.networkPassphrase = "Network passphrase is required";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function buildTransactionXdr(
  fields: SandboxTransactionFields
): BuildResult {
  const validation = validateTransactionFields(fields);
  if (!validation.valid) {
    throw new Error(
      `Invalid fields: ${Object.values(validation.errors).join(", ")}`
    );
  }

  // Produce a deterministic mock XDR for sandbox testing purposes.
  // In production this would use @stellar/stellar-sdk to build a real envelope.
  const payload = JSON.stringify({
    src: fields.sourceAccount,
    dst: fields.destinationAccount,
    amt: fields.amount,
    asset: fields.asset,
    op: fields.operationType,
    memo: fields.memo,
    fee: fields.fee,
    net: fields.networkPassphrase,
  });

  const xdr = `SANDBOX_XDR_${btoa(payload).replace(/=/g, "")}`;

  const summary =
    `${fields.operationType.toUpperCase()} ` +
    (fields.operationType === "manage_data"
      ? `from ${fields.sourceAccount.slice(0, 8)}…`
      : `${fields.amount} ${fields.asset} → ${fields.destinationAccount.slice(0, 8)}…`);

  return { xdr, summary };
}

export const DEFAULT_FIELDS: SandboxTransactionFields = {
  sourceAccount: "",
  destinationAccount: "",
  amount: "10",
  asset: "XLM",
  operationType: "payment",
  memo: "",
  fee: "100",
  networkPassphrase: "Test SDF Network ; September 2015",
};
