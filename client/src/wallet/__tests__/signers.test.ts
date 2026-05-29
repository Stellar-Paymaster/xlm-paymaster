import StellarSdk, { Transaction } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import { KeypairSigner, Sep43WalletSigner } from "../signers";

const NETWORK = StellarSdk.Networks.TESTNET;

function buildUnsignedPaymentXdr(sourcePublicKey: string): string {
  // A static sequence number keeps the test fully offline (no Horizon call).
  const account = new StellarSdk.Account(sourcePublicKey, "1");
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: StellarSdk.Keypair.random().publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: "1",
      }),
    )
    .setTimeout(180)
    .build();

  return tx.toXDR();
}

describe("KeypairSigner", () => {
  it("signs a transaction in-process and reports the signer address", async () => {
    const keypair = StellarSdk.Keypair.random();
    const signer = new KeypairSigner(keypair, NETWORK);
    const xdr = buildUnsignedPaymentXdr(keypair.publicKey());

    const { signedTxXdr, signerAddress } = await signer.signTransaction(xdr);

    expect(signerAddress).toBe(keypair.publicKey());

    // The signed envelope must carry exactly one valid signature.
    const signed = StellarSdk.TransactionBuilder.fromXDR(
      signedTxXdr,
      NETWORK,
    ) as Transaction;
    expect(signed.signatures).toHaveLength(1);
    expect(() => signed.hash()).not.toThrow();
  });

  it("accepts an XDR-serializable transaction object", async () => {
    const keypair = StellarSdk.Keypair.random();
    const signer = new KeypairSigner(keypair, NETWORK);
    const xdr = buildUnsignedPaymentXdr(keypair.publicKey());
    const txObject = StellarSdk.TransactionBuilder.fromXDR(xdr, NETWORK);

    const { signedTxXdr } = await signer.signTransaction(txObject);
    expect(typeof signedTxXdr).toBe("string");
    expect(signedTxXdr.length).toBeGreaterThan(0);
  });

  it("reports the address via getAddress()", async () => {
    const keypair = StellarSdk.Keypair.random();
    const signer = new KeypairSigner(keypair, NETWORK);
    await expect(signer.getAddress()).resolves.toEqual({
      address: keypair.publicKey(),
    });
  });

  it("validates its constructor arguments", () => {
    expect(() => new KeypairSigner(undefined as never, NETWORK)).toThrow(
      /requires a Stellar Keypair/,
    );
    expect(
      () => new KeypairSigner(StellarSdk.Keypair.random(), ""),
    ).toThrow(/requires a network passphrase/);
  });
});

describe("Sep43WalletSigner", () => {
  it("normalizes the SEP-43 object response", async () => {
    const wallet = {
      signTransaction: vi
        .fn()
        .mockResolvedValue({ signedTxXdr: "SIGNED", signerAddress: "GSIGNER" }),
    };
    const signer = new Sep43WalletSigner(wallet, {
      id: "freighter",
      networkPassphrase: NETWORK,
    });

    const result = await signer.signTransaction("RAW");

    expect(signer.id).toBe("freighter");
    expect(result).toEqual({ signedTxXdr: "SIGNED", signerAddress: "GSIGNER" });
    expect(wallet.signTransaction).toHaveBeenCalledWith("RAW", {
      networkPassphrase: NETWORK,
      address: undefined,
    });
  });

  it("normalizes a bare-string response", async () => {
    const wallet = {
      signTransaction: vi.fn().mockResolvedValue("SIGNED_STRING"),
    };
    const signer = new Sep43WalletSigner(wallet);

    const result = await signer.signTransaction("RAW", { address: "GADDR" });
    expect(result).toEqual({
      signedTxXdr: "SIGNED_STRING",
      signerAddress: "GADDR",
    });
  });

  it("falls back to getPublicKey() for getAddress()", async () => {
    const wallet = {
      signTransaction: vi.fn(),
      getPublicKey: vi.fn().mockResolvedValue("GPUBLIC"),
    };
    const signer = new Sep43WalletSigner(wallet);
    await expect(signer.getAddress()).resolves.toEqual({ address: "GPUBLIC" });
  });

  it("throws when no address source is available", async () => {
    const signer = new Sep43WalletSigner({ signTransaction: vi.fn() });
    await expect(signer.getAddress()).rejects.toThrow(/does not expose/);
  });
});
