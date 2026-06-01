/**
 * errorCodes.ts
 * Interactive Error Codes (#503)
 *
 * A public wiki / registry for every error code returned by the Fluid API.
 * Provides lookup, search, and formatted help for developers.
 */

export interface ErrorCodeEntry {
  code: string;
  httpStatus: number;
  title: string;
  description: string;
  causes: string[];
  remediation: string;
  docsUrl: string;
}

const BASE_URL = "https://docs.fluid.dev/errors";

/** Central registry of all Fluid API error codes. */
export const ERROR_CODE_REGISTRY: ErrorCodeEntry[] = [
  {
    code: "FLUID_001",
    httpStatus: 400,
    title: "Invalid Transaction XDR",
    description: "The submitted transaction XDR could not be decoded or is malformed.",
    causes: [
      "XDR was serialized with an incompatible SDK version",
      "The string was truncated or corrupted in transit",
      "Wrong network passphrase used during encoding",
    ],
    remediation:
      "Re-build the transaction using the latest @stellar/stellar-sdk and ensure the network passphrase matches the target network.",
    docsUrl: `${BASE_URL}#fluid-001`,
  },
  {
    code: "FLUID_002",
    httpStatus: 400,
    title: "Fee Below Minimum",
    description: "The fee set on the inner transaction is below the Stellar network minimum (100 stroops).",
    causes: ["baseFee was set too low", "Fee was not updated after network base fee increase"],
    remediation: "Use FluidClient.requestFeeBump() which automatically sets a compliant fee, or pass a baseFee ≥ 100.",
    docsUrl: `${BASE_URL}#fluid-002`,
  },
  {
    code: "FLUID_003",
    httpStatus: 401,
    title: "Missing or Invalid API Key",
    description: "The request did not include a valid Fluid API key.",
    causes: ["X-Fluid-API-Key header was omitted", "API key has been revoked", "Key belongs to a different environment"],
    remediation: "Generate a new API key from the Fluid dashboard and pass it via the X-Fluid-API-Key header.",
    docsUrl: `${BASE_URL}#fluid-003`,
  },
  {
    code: "FLUID_004",
    httpStatus: 403,
    title: "Tenant Quota Exceeded",
    description: "The tenant has exceeded their monthly fee-bump quota.",
    causes: ["High transaction volume", "Quota not upgraded for growth"],
    remediation: "Upgrade your plan on the Fluid dashboard or contact support to request a temporary quota increase.",
    docsUrl: `${BASE_URL}#fluid-004`,
  },
  {
    code: "FLUID_005",
    httpStatus: 404,
    title: "Transaction Not Found",
    description: "No transaction matching the supplied hash was found on the network.",
    causes: [
      "Transaction was never submitted",
      "Transaction expired (ledger close timeout)",
      "Wrong network queried",
    ],
    remediation: "Verify the hash and ensure you are querying the same network (testnet vs mainnet) where the transaction was submitted.",
    docsUrl: `${BASE_URL}#fluid-005`,
  },
  {
    code: "FLUID_006",
    httpStatus: 409,
    title: "Duplicate Transaction",
    description: "This transaction hash has already been processed by Fluid.",
    causes: ["Client retry without a new sequence number", "Idempotency key collision"],
    remediation: "Rebuild the transaction with an incremented sequence number or pass a fresh idempotency key.",
    docsUrl: `${BASE_URL}#fluid-006`,
  },
  {
    code: "FLUID_007",
    httpStatus: 429,
    title: "Rate Limit Exceeded",
    description: "Too many requests were made to the Fluid API in a short window.",
    causes: ["Burst of concurrent requests", "Missing retry back-off logic"],
    remediation: "Implement exponential back-off. The Retry-After header indicates when you may retry.",
    docsUrl: `${BASE_URL}#fluid-007`,
  },
  {
    code: "FLUID_008",
    httpStatus: 500,
    title: "Internal Server Error",
    description: "An unexpected error occurred on the Fluid server.",
    causes: ["Transient infrastructure issue", "Unhandled edge case in transaction processing"],
    remediation: "Retry with exponential back-off. If the error persists, open a support ticket and include the request ID from the X-Request-ID header.",
    docsUrl: `${BASE_URL}#fluid-008`,
  },
  {
    code: "FLUID_009",
    httpStatus: 503,
    title: "Stellar Network Unavailable",
    description: "The Fluid server could not reach the Stellar Horizon or Soroban RPC endpoint.",
    causes: ["Stellar network maintenance window", "DNS or connectivity issue between Fluid and Horizon"],
    remediation: "Check the Stellar network status at https://status.stellar.org and retry once the network is available.",
    docsUrl: `${BASE_URL}#fluid-009`,
  },
  {
    code: "FLUID_010",
    httpStatus: 400,
    title: "Invalid Soroban Contract Invocation",
    description: "The Soroban contract call included in the transaction is invalid or the simulation failed.",
    causes: [
      "Contract does not exist on the network",
      "Function arguments do not match the contract ABI",
      "Insufficient resource limits (instructions, memory)",
    ],
    remediation: "Run stellar contract invoke --dry-run to validate before submitting, and check resource limits with the Soroban RPC simulateTransaction endpoint.",
    docsUrl: `${BASE_URL}#fluid-010`,
  },
];

// ─── Lookup Functions ─────────────────────────────────────────────────────────

/**
 * Look up an error entry by its code (e.g. "FLUID_001").
 */
export function lookupByCode(code: string): ErrorCodeEntry | undefined {
  return ERROR_CODE_REGISTRY.find(
    (e) => e.code.toUpperCase() === code.toUpperCase()
  );
}

/**
 * Look up all errors for a given HTTP status code.
 */
export function lookupByStatus(httpStatus: number): ErrorCodeEntry[] {
  return ERROR_CODE_REGISTRY.filter((e) => e.httpStatus === httpStatus);
}

/**
 * Full-text search across title, description, causes, and remediation.
 */
export function searchErrorCodes(query: string): ErrorCodeEntry[] {
  const q = query.toLowerCase();
  return ERROR_CODE_REGISTRY.filter((e) => {
    return (
      e.title.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.remediation.toLowerCase().includes(q) ||
      e.causes.some((c) => c.toLowerCase().includes(q))
    );
  });
}

/**
 * Return a formatted, human-readable help string for a given error code.
 */
export function formatErrorHelp(code: string): string {
  const entry = lookupByCode(code);
  if (!entry) {
    return `Unknown error code: ${code}\nBrowse all codes at ${BASE_URL}`;
  }

  const lines: string[] = [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `${entry.code}  •  HTTP ${entry.httpStatus}  •  ${entry.title}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `Description`,
    `  ${entry.description}`,
    ``,
    `Common Causes`,
    ...entry.causes.map((c) => `  • ${c}`),
    ``,
    `Remediation`,
    `  ${entry.remediation}`,
    ``,
    `Docs  →  ${entry.docsUrl}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ];

  return lines.join("\n");
}

/**
 * Return a compact list of all registered error codes for CLI --list output.
 */
export function listAllCodes(): string {
  const lines = ERROR_CODE_REGISTRY.map(
    (e) => `  ${e.code.padEnd(12)} [HTTP ${e.httpStatus}]  ${e.title}`
  );
  return [`All Fluid API Error Codes (${lines.length} total)`, ...lines].join("\n");
}
