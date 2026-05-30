import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import StellarSdk from "@stellar/stellar-sdk";

import {
  _resetState,
  cancelSigningRequest,
  createSigningRequest,
  decodeSigningRequestQR,
  decodeSigningResponseQR,
  encodeSigningResponseQR,
  listPendingRequests,
  submitSigningResponse,
  verifyTransactionSignature,
  type SigningRequest,
  type SigningResponse,
} from "./offlineSigning";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NETWORK = StellarSdk.Networks.TESTNET;

function makeKeypair(): StellarSdk.Keypair {
  return StellarSdk.Keypair.random();
}

/**
 * Build and sign a minimal Stellar transaction, returning both the unsigned
 * and signed XDR strings.
 */
function buildTransaction(signer: StellarSdk.Keypair): {
  unsignedXdr: string;
  signedXdr: string;
  txHash: Buffer;
} {
  const account = new StellarSdk.Account(signer.publicKey(), "100");
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: StellarSdk.Keypair.random().publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: "10",
      }),
    )
    .setTimeout(30)
    .build();

  const unsignedXdr = tx.toXDR();
  tx.sign(signer);
  return { unsignedXdr, signedXdr: tx.toXDR(), txHash: tx.hash() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createSigningRequest", () => {
  beforeEach(() => _resetState());
  afterEach(() => _resetState());

  it("returns a QR payload with a nonce and expiry", () => {
    const kp = makeKeypair();
    const { unsignedXdr } = buildTransaction(kp);

    const result = createSigningRequest({
      transactionXdr: unsignedXdr,
      networkPassphrase: NETWORK,
      signerPublicKey: kp.publicKey(),
      label: "Test sweep",
    });

    expect(result.nonce).toBeTruthy();
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(result.qrPayload).toBeTruthy();
  });

  it("throws on invalid public key", () => {
    expect(() =>
      createSigningRequest({
        transactionXdr: "dummyXdr",
        networkPassphrase: NETWORK,
        signerPublicKey: "NOT_A_VALID_KEY",
      }),
    ).toThrow(/Invalid Stellar public key/);
  });

  it("adds request to pending list", () => {
    const kp = makeKeypair();
    const { unsignedXdr } = buildTransaction(kp);

    createSigningRequest({
      transactionXdr: unsignedXdr,
      networkPassphrase: NETWORK,
      signerPublicKey: kp.publicKey(),
    });

    expect(listPendingRequests()).toHaveLength(1);
  });

  it("rejects when pending limit is reached", () => {
    vi.stubEnv("OFFLINE_SIGNING_MAX_PENDING", "2");

    const kp = makeKeypair();
    const { unsignedXdr } = buildTransaction(kp);
    const params = {
      transactionXdr: unsignedXdr,
      networkPassphrase: NETWORK,
      signerPublicKey: kp.publicKey(),
    };

    createSigningRequest(params);
    createSigningRequest(params);
    expect(() => createSigningRequest(params)).toThrow(/Too many pending/);

    vi.unstubAllEnvs();
  });
});

describe("decodeSigningRequestQR", () => {
  beforeEach(() => _resetState());
  afterEach(() => _resetState());

  it("round-trips the signing request through QR encoding", () => {
    const kp = makeKeypair();
    const { unsignedXdr } = buildTransaction(kp);

    const { qrPayload } = createSigningRequest({
      transactionXdr: unsignedXdr,
      networkPassphrase: NETWORK,
      signerPublicKey: kp.publicKey(),
      label: "Treasury sweep",
    });

    const decoded: SigningRequest = decodeSigningRequestQR(qrPayload);
    expect(decoded.signerPublicKey).toBe(kp.publicKey());
    expect(decoded.label).toBe("Treasury sweep");
    expect(decoded.networkPassphrase).toBe(NETWORK);
  });
});

describe("verifyTransactionSignature", () => {
  it("passes for a valid signature", () => {
    const kp = makeKeypair();
    const { signedXdr, txHash } = buildTransaction(kp);
    const sigHex = kp.sign(txHash).toString("hex");

    expect(() =>
      verifyTransactionSignature({
        transactionXdr: signedXdr,
        networkPassphrase: NETWORK,
        signerPublicKey: kp.publicKey(),
        rawSignatureHex: sigHex,
      }),
    ).not.toThrow();
  });

  it("throws for an invalid signature", () => {
    const kp = makeKeypair();
    const { signedXdr } = buildTransaction(kp);
    const badSig = "00".repeat(64);

    expect(() =>
      verifyTransactionSignature({
        transactionXdr: signedXdr,
        networkPassphrase: NETWORK,
        signerPublicKey: kp.publicKey(),
        rawSignatureHex: badSig,
      }),
    ).toThrow(/Signature verification failed/);
  });

  it("detects valid signature on signed XDR without raw sig param", () => {
    const kp = makeKeypair();
    const { signedXdr } = buildTransaction(kp);

    expect(() =>
      verifyTransactionSignature({
        transactionXdr: signedXdr,
        networkPassphrase: NETWORK,
        signerPublicKey: kp.publicKey(),
      }),
    ).not.toThrow();
  });

  it("rejects unsigned XDR when checking envelope signatures", () => {
    const kp = makeKeypair();
    const { unsignedXdr } = buildTransaction(kp);

    expect(() =>
      verifyTransactionSignature({
        transactionXdr: unsignedXdr,
        networkPassphrase: NETWORK,
        signerPublicKey: kp.publicKey(),
      }),
    ).toThrow(/No valid signature/);
  });

  it("throws on invalid XDR", () => {
    expect(() =>
      verifyTransactionSignature({
        transactionXdr: "notvalidxdr",
        networkPassphrase: NETWORK,
        signerPublicKey: StellarSdk.Keypair.random().publicKey(),
      }),
    ).toThrow(/Invalid transaction XDR/);
  });
});

describe("submitSigningResponse", () => {
  beforeEach(() => _resetState());
  afterEach(() => _resetState());

  function createAndSign(kp: StellarSdk.Keypair): {
    nonce: string;
    response: SigningResponse;
  } {
    const { unsignedXdr, signedXdr, txHash } = buildTransaction(kp);
    const { nonce } = createSigningRequest({
      transactionXdr: unsignedXdr,
      networkPassphrase: NETWORK,
      signerPublicKey: kp.publicKey(),
    });

    const response: SigningResponse = {
      nonce,
      signature: kp.sign(txHash).toString("hex"),
      signedTransactionXdr: signedXdr,
    };
    return { nonce, response };
  }

  it("accepts a valid response and removes it from pending", () => {
    const kp = makeKeypair();
    const { nonce, response } = createAndSign(kp);

    const result = submitSigningResponse(response);
    expect(result.request.nonce).toBe(nonce);
    expect(result.signedTransactionXdr).toBeTruthy();
    expect(listPendingRequests()).toHaveLength(0);
  });

  it("rejects a replayed nonce", () => {
    const kp = makeKeypair();
    const { response } = createAndSign(kp);

    submitSigningResponse(response);
    expect(() => submitSigningResponse(response)).toThrow(/already been used/);
  });

  it("rejects an unknown nonce", () => {
    const kp = makeKeypair();
    const { signedXdr, txHash } = buildTransaction(kp);
    const fakeResponse: SigningResponse = {
      nonce: "deadbeef00000000deadbeef00000000",
      signature: kp.sign(txHash).toString("hex"),
      signedTransactionXdr: signedXdr,
    };

    expect(() => submitSigningResponse(fakeResponse)).toThrow(/not found/);
  });

  it("rejects an expired request", async () => {
    vi.stubEnv("OFFLINE_SIGNING_TTL_MS", "50");

    const kp = makeKeypair();
    const { unsignedXdr, signedXdr, txHash } = buildTransaction(kp);
    const { nonce } = createSigningRequest({
      transactionXdr: unsignedXdr,
      networkPassphrase: NETWORK,
      signerPublicKey: kp.publicKey(),
    });

    // Wait for TTL
    await new Promise((r) => setTimeout(r, 100));

    const response: SigningResponse = {
      nonce,
      signature: kp.sign(txHash).toString("hex"),
      signedTransactionXdr: signedXdr,
    };

    expect(() => submitSigningResponse(response)).toThrow(/expired/);

    vi.unstubAllEnvs();
  });

  it("rejects a response with an invalid signature", () => {
    const kp = makeKeypair();
    const { unsignedXdr, signedXdr } = buildTransaction(kp);
    const { nonce } = createSigningRequest({
      transactionXdr: unsignedXdr,
      networkPassphrase: NETWORK,
      signerPublicKey: kp.publicKey(),
    });

    const badResponse: SigningResponse = {
      nonce,
      signature: "00".repeat(64),
      signedTransactionXdr: signedXdr,
    };

    expect(() => submitSigningResponse(badResponse)).toThrow(
      /Signature verification failed/,
    );
  });
});

describe("encodeSigningResponseQR / decodeSigningResponseQR", () => {
  it("round-trips a signing response", () => {
    const response: SigningResponse = {
      nonce: "abc123",
      signature: "ff".repeat(64),
      signedTransactionXdr: "dummyXDR",
    };

    const qr = encodeSigningResponseQR(response);
    const decoded = decodeSigningResponseQR(qr);
    expect(decoded).toEqual(response);
  });
});

describe("cancelSigningRequest", () => {
  beforeEach(() => _resetState());
  afterEach(() => _resetState());

  it("removes a pending request and returns true", () => {
    const kp = makeKeypair();
    const { unsignedXdr } = buildTransaction(kp);
    const { nonce } = createSigningRequest({
      transactionXdr: unsignedXdr,
      networkPassphrase: NETWORK,
      signerPublicKey: kp.publicKey(),
    });

    expect(cancelSigningRequest(nonce)).toBe(true);
    expect(listPendingRequests()).toHaveLength(0);
  });

  it("returns false for an unknown nonce", () => {
    expect(cancelSigningRequest("doesnotexist")).toBe(false);
  });
});

describe("listPendingRequests", () => {
  beforeEach(() => _resetState());
  afterEach(() => _resetState());

  it("prunes expired requests when listing", async () => {
    vi.stubEnv("OFFLINE_SIGNING_TTL_MS", "50");

    const kp = makeKeypair();
    const { unsignedXdr } = buildTransaction(kp);
    createSigningRequest({
      transactionXdr: unsignedXdr,
      networkPassphrase: NETWORK,
      signerPublicKey: kp.publicKey(),
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(listPendingRequests()).toHaveLength(0);

    vi.unstubAllEnvs();
  });

  it("lists non-expired requests", () => {
    const kp = makeKeypair();
    const { unsignedXdr } = buildTransaction(kp);
    createSigningRequest({
      transactionXdr: unsignedXdr,
      networkPassphrase: NETWORK,
      signerPublicKey: kp.publicKey(),
    });
    expect(listPendingRequests()).toHaveLength(1);
  });
});
