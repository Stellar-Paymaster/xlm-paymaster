import StellarSdk from "@stellar/stellar-sdk";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { FluidClient } from "../../index";
import { createFluidMockServer } from "../../testUtils/mockServer";
import { KeypairSigner } from "../signers";
import { WalletConnectProvider, WalletConnectSigner } from "../walletConnect";

const TEST_SERVER_URL = "http://localhost:3000";
const NETWORK = StellarSdk.Networks.TESTNET;
const ADDRESS = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

const client = new FluidClient({
  serverUrl: TEST_SERVER_URL,
  networkPassphrase: NETWORK,
});

function buildUnsignedPaymentXdr(sourcePublicKey: string): string {
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

describe("FluidClient universal wallet signing", () => {
  const server = createFluidMockServer({ response: "success" });
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("signs through a WalletConnect provider then requests a fee bump", async () => {
    const signedXdr = "SIGNED_BY_WALLET";
    const request = vi.fn().mockResolvedValue({ signedXDR: signedXdr });
    const provider: WalletConnectProvider = { request };

    const signer = new WalletConnectSigner({
      provider,
      topic: "topic-1",
      address: ADDRESS,
      networkPassphrase: NETWORK,
    });

    const result = await client.buildAndRequestFeeBumpWithWallet(
      signer,
      "UNSIGNED_XDR",
    );

    // The wallet received the unsigned XDR via the standard Stellar method...
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          method: "stellar_signXDR",
          params: { xdr: "UNSIGNED_XDR" },
        }),
      }),
    );
    // ...and the fee-bump response flowed back from the server.
    expect(result.status).toBe("success");
    expect(result.xdr).toBeDefined();
  });

  it("signs through an in-process keypair then requests a fee bump", async () => {
    const keypair = StellarSdk.Keypair.random();
    const signer = new KeypairSigner(keypair, NETWORK);
    const xdr = buildUnsignedPaymentXdr(keypair.publicKey());

    const result = await client.buildAndRequestFeeBumpWithWallet(signer, xdr);

    expect(result.status).toBe("success");
  });

  it("rejects a signer that does not implement signTransaction", async () => {
    await expect(
      client.signWithWallet({} as never, "RAW"),
    ).rejects.toThrow(/requires a WalletSigner/);
  });

  it("defaults the network passphrase to the client configuration", async () => {
    const signTransaction = vi
      .fn()
      .mockResolvedValue({ signedTxXdr: "SIGNED", signerAddress: ADDRESS });

    await client.signWithWallet(
      { id: "spy", getAddress: vi.fn(), signTransaction },
      "RAW",
    );

    expect(signTransaction).toHaveBeenCalledWith(
      "RAW",
      expect.objectContaining({ networkPassphrase: NETWORK }),
    );
  });
});
