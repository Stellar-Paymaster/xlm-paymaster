export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ErrorResponseSnapshot {
  body: JsonValue | string;
  contentType: string | null;
  status: number;
}

export interface ErrorParityCase {
  body?: string;
  headers?: Record<string, string>;
  method: string;
  name: string;
  path: string;
}

export interface ErrorParityMismatch {
  caseName: string;
  field: "status" | "contentType" | "body";
  node: JsonValue | string | number | null;
  rust: JsonValue | string | number | null;
}

export interface ErrorParityResult {
  caseName: string;
  mismatches: ErrorParityMismatch[];
  node: ErrorResponseSnapshot;
  rust: ErrorResponseSnapshot;
}

export const defaultErrorParityCases: ErrorParityCase[] = [
  {
    body: JSON.stringify({ xdr: "AAAA" }),
    headers: { "content-type": "application/json" },
    method: "POST",
    name: "missing-api-key",
    path: "/fee-bump",
  },
  {
    body: JSON.stringify({ xdr: "AAAA" }),
    headers: { "content-type": "application/json", "x-api-key": "bad-key" },
    method: "POST",
    name: "invalid-api-key",
    path: "/fee-bump",
  },
  {
    body: JSON.stringify({ xdr: "" }),
    headers: { "content-type": "application/json", "x-api-key": "paymaster-pro-demo-key" },
    method: "POST",
    name: "empty-xdr",
    path: "/fee-bump",
  },
  {
    body: JSON.stringify({ xdr: "not-base64", submit: false }),
    headers: { "content-type": "application/json", "x-api-key": "paymaster-pro-demo-key" },
    method: "POST",
    name: "malformed-xdr",
    path: "/fee-bump",
  },
  {
    body: "{",
    headers: { "content-type": "application/json", "x-api-key": "paymaster-pro-demo-key" },
    method: "POST",
    name: "malformed-json",
    path: "/fee-bump",
  },
  {
    method: "GET",
    name: "unknown-route",
    path: "/__parity_missing_route__",
  },
];

export function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJson(entryValue as JsonValue)]),
    );
  }

  return value;
}

export function normalizeErrorSnapshot(snapshot: ErrorResponseSnapshot): ErrorResponseSnapshot {
  const contentType = snapshot.contentType?.split(";")[0]?.trim().toLowerCase() ?? null;

  return {
    body:
      typeof snapshot.body === "string"
        ? snapshot.body
        : sortJson(snapshot.body),
    contentType,
    status: snapshot.status,
  };
}

export function compareErrorResponses(
  caseName: string,
  nodeSnapshot: ErrorResponseSnapshot,
  rustSnapshot: ErrorResponseSnapshot,
): ErrorParityResult {
  const node = normalizeErrorSnapshot(nodeSnapshot);
  const rust = normalizeErrorSnapshot(rustSnapshot);
  const mismatches: ErrorParityMismatch[] = [];

  if (node.status !== rust.status) {
    mismatches.push({
      caseName,
      field: "status",
      node: node.status,
      rust: rust.status,
    });
  }

  if (node.contentType !== rust.contentType) {
    mismatches.push({
      caseName,
      field: "contentType",
      node: node.contentType,
      rust: rust.contentType,
    });
  }

  if (JSON.stringify(node.body) !== JSON.stringify(rust.body)) {
    mismatches.push({
      caseName,
      field: "body",
      node: node.body,
      rust: rust.body,
    });
  }

  return {
    caseName,
    mismatches,
    node,
    rust,
  };
}

export async function captureErrorResponse(
  baseUrl: string,
  parityCase: ErrorParityCase,
): Promise<ErrorResponseSnapshot> {
  const response = await fetch(new URL(parityCase.path, baseUrl), {
    body: parityCase.body,
    headers: parityCase.headers,
    method: parityCase.method,
  });
  const text = await response.text();

  try {
    return {
      body: JSON.parse(text) as JsonValue,
      contentType: response.headers.get("content-type"),
      status: response.status,
    };
  } catch {
    return {
      body: text,
      contentType: response.headers.get("content-type"),
      status: response.status,
    };
  }
}

export async function compareErrorParity(
  nodeBaseUrl: string,
  rustBaseUrl: string,
  parityCases: ErrorParityCase[] = defaultErrorParityCases,
): Promise<ErrorParityResult[]> {
  const results: ErrorParityResult[] = [];

  for (const parityCase of parityCases) {
    const [node, rust] = await Promise.all([
      captureErrorResponse(nodeBaseUrl, parityCase),
      captureErrorResponse(rustBaseUrl, parityCase),
    ]);

    results.push(compareErrorResponses(parityCase.name, node, rust));
  }

  return results;
}
