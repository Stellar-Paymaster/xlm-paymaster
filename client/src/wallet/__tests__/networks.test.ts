import { describe, expect, it } from "vitest";
import {
  STELLAR_CHAINS,
  STELLAR_PASSPHRASES,
  chainIdForPassphrase,
  isStellarChainId,
  passphraseForChainId,
} from "../networks";

describe("wallet networks", () => {
  describe("chainIdForPassphrase", () => {
    it("maps the public network passphrase to the pubnet chain", () => {
      expect(chainIdForPassphrase(STELLAR_PASSPHRASES.PUBLIC)).toBe(
        STELLAR_CHAINS.PUBLIC,
      );
    });

    it("maps the testnet passphrase to the testnet chain", () => {
      expect(chainIdForPassphrase(STELLAR_PASSPHRASES.TESTNET)).toBe(
        STELLAR_CHAINS.TESTNET,
      );
    });

    it("throws for an unknown passphrase", () => {
      expect(() => chainIdForPassphrase("Some Custom Network")).toThrow(
        /Unknown Stellar network passphrase/,
      );
    });
  });

  describe("passphraseForChainId", () => {
    it("round-trips both known chains", () => {
      expect(passphraseForChainId(STELLAR_CHAINS.PUBLIC)).toBe(
        STELLAR_PASSPHRASES.PUBLIC,
      );
      expect(passphraseForChainId(STELLAR_CHAINS.TESTNET)).toBe(
        STELLAR_PASSPHRASES.TESTNET,
      );
    });

    it("throws for an unknown chain id", () => {
      expect(() => passphraseForChainId("stellar:futurenet")).toThrow(
        /Unknown Stellar WalletConnect chain id/,
      );
    });
  });

  describe("isStellarChainId", () => {
    it("recognizes known chains and rejects others", () => {
      expect(isStellarChainId(STELLAR_CHAINS.PUBLIC)).toBe(true);
      expect(isStellarChainId(STELLAR_CHAINS.TESTNET)).toBe(true);
      expect(isStellarChainId("eip155:1")).toBe(false);
    });
  });
});
