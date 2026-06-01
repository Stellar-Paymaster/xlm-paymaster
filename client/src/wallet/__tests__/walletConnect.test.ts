import { describe, expect, it, vi } from "vitest";
import {
  STELLAR_CHAINS,
  STELLAR_PASSPHRASES,
} from "../networks";
import {
  STELLAR_METHODS,
  STELLAR_NAMESPACE,
  WalletConnectProvider,
  WalletConnectSession,
  WalletConnectSigner,
  buildStellarRequiredNamespaces,
  createWalletConnectSigner,
  extractSignedXdr,
  parseStellarAccounts,
} from "../walletConnect";

const ADDRESS = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const TOPIC = "abc123topic";

function makeSession(
  overrides: Partial<WalletConnectSession> = {},
): WalletConnectSession {
  return {
    topic: TOPIC,
    namespaces: {
      [STELLAR_NAMESPACE]: {
        accounts: [`${STELLAR_CHAINS.TESTNET}:${ADDRESS}`],
        methods: Object.values(STELLAR_METHODS),
        events: [],
      },
    },
    ...overrides,
  };
}

describe("buildStellarRequiredNamespaces", () => {
  it("defaults to testnet and both methods", () => {
    const ns = buildStellarRequiredNamespaces();
    expect(ns[STELLAR_NAMESPACE].chains).toEqual([STELLAR_CHAINS.TESTNET]);
    expect(ns[STELLAR_NAMESPACE].methods).toEqual([
      STELLAR_METHODS.signXDR,
      STELLAR_METHODS.signAndSubmitXDR,
    ]);
    expect(ns[STELLAR_NAMESPACE].events).toEqual([]);
  });

  it("honors custom chains and methods", () => {
    const ns = buildStellarRequiredNamespaces({
      chains: [STELLAR_CHAINS.PUBLIC],
      methods: [STELLAR_METHODS.signXDR],
      events: ["accountsChanged"],
    });
    expect(ns[STELLAR_NAMESPACE].chains).toEqual([STELLAR_CHAINS.PUBLIC]);
    expect(ns[STELLAR_NAMESPACE].methods).toEqual([STELLAR_METHODS.signXDR]);
    expect(ns[STELLAR_NAMESPACE].events).toEqual(["accountsChanged"]);
  });
});

describe("parseStellarAccounts", () => {
  it("parses CAIP-10 accounts into chain/address pairs", () => {
    const accounts = parseStellarAccounts(makeSession());
    expect(accounts).toEqual([
      { chainId: STELLAR_CHAINS.TESTNET, address: ADDRESS },
    ]);
  });

  it("filters by chain id when provided", () => {
    const session = makeSession({
      namespaces: {
        [STELLAR_NAMESPACE]: {
          accounts: [
            `${STELLAR_CHAINS.TESTNET}:${ADDRESS}`,
            `${STELLAR_CHAINS.PUBLIC}:${ADDRESS}`,
          ],
          methods: Object.values(STELLAR_METHODS),
          events: [],
        },
      },
    });

    expect(parseStellarAccounts(session, STELLAR_CHAINS.PUBLIC)).toEqual([
      { chainId: STELLAR_CHAINS.PUBLIC, address: ADDRESS },
    ]);
  });

  it("returns an empty array when the stellar namespace is missing", () => {
    expect(parseStellarAccounts({ topic: TOPIC, namespaces: {} })).toEqual([]);
  });
});

describe("extractSignedXdr", () => {
  it("accepts the WalletConnect { signedXDR } shape", () => {
    expect(extractSignedXdr({ signedXDR: "SIGNED" })).toBe("SIGNED");
  });

  it("accepts the SEP-43 { signedTxXdr } shape", () => {
    expect(extractSignedXdr({ signedTxXdr: "SIGNED" })).toBe("SIGNED");
  });

  it("accepts a bare string", () => {
    expect(extractSignedXdr("  SIGNED  ")).toBe("SIGNED");
  });

  it("throws on an unrecognized shape", () => {
    expect(() => extractSignedXdr({ nope: true })).toThrow(
      /unrecognized signing response/,
    );
  });
});

describe("WalletConnectSigner", () => {
  it("requests stellar_signXDR by default and normalizes the result", async () => {
    const request = vi.fn().mockResolvedValue({ signedXDR: "SIGNED_XDR" });
    const provider: WalletConnectProvider = { request };

    const signer = new WalletConnectSigner({
      provider,
      topic: TOPIC,
      address: ADDRESS,
      networkPassphrase: STELLAR_PASSPHRASES.TESTNET,
    });

    const result = await signer.signTransaction("RAW_XDR");

    expect(result).toEqual({
      signedTxXdr: "SIGNED_XDR",
      signerAddress: ADDRESS,
    });
    expect(request).toHaveBeenCalledWith({
      topic: TOPIC,
      chainId: STELLAR_CHAINS.TESTNET,
      request: {
        method: STELLAR_METHODS.signXDR,
        params: { xdr: "RAW_XDR" },
      },
    });
  });

  it("uses stellar_signAndSubmitXDR when submit is requested", async () => {
    const request = vi.fn().mockResolvedValue({ signedXDR: "SIGNED_XDR" });
    const signer = new WalletConnectSigner({
      provider: { request },
      topic: TOPIC,
      address: ADDRESS,
      chainId: STELLAR_CHAINS.PUBLIC,
    });

    await signer.signTransaction("RAW_XDR", { submit: true });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: STELLAR_CHAINS.PUBLIC,
        request: expect.objectContaining({
          method: STELLAR_METHODS.signAndSubmitXDR,
        }),
      }),
    );
  });

  it("exposes the configured address", async () => {
    const signer = new WalletConnectSigner({
      provider: { request: vi.fn() },
      topic: TOPIC,
      address: ADDRESS,
      chainId: STELLAR_CHAINS.TESTNET,
    });

    await expect(signer.getAddress()).resolves.toEqual({ address: ADDRESS });
  });

  it("validates required construction options", () => {
    expect(
      () =>
        new WalletConnectSigner({
          provider: { request: vi.fn() },
          topic: TOPIC,
          address: ADDRESS,
        }),
    ).toThrow(/chainId or networkPassphrase/);
  });
});

describe("createWalletConnectSigner", () => {
  it("selects the first matching account from the session", async () => {
    const request = vi.fn().mockResolvedValue("SIGNED");
    const signer = createWalletConnectSigner({ request }, makeSession(), {
      networkPassphrase: STELLAR_PASSPHRASES.TESTNET,
    });

    await expect(signer.getAddress()).resolves.toEqual({ address: ADDRESS });
  });

  it("throws when the session has no Stellar account", () => {
    expect(() =>
      createWalletConnectSigner({ request: vi.fn() }, {
        topic: TOPIC,
        namespaces: {},
      }),
    ).toThrow(/No Stellar account/);
  });
});
