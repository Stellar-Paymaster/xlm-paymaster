import { Connection, Keypair, Transaction, PublicKey, NonceAccount } from "@solana/web3.js";
import { FeeSponsor, SponsorResponse } from "./base";
import { AppError } from "../errors/AppError";

export interface SolanaSponsorParams {
  transactionB64: string;
  feePayerSecret: string;
  rpcUrl: string;
  nonceAccountPubkey?: string;
}

export class SolanaFeeSponsor implements FeeSponsor {
  async estimateFee(params: SolanaSponsorParams): Promise<bigint> {
    return BigInt(5000); 
  }

  async buildSponsoredTx(params: SolanaSponsorParams): Promise<SponsorResponse> {
    const { transactionB64, feePayerSecret, rpcUrl, nonceAccountPubkey } = params;

    try {
      const connection = new Connection(rpcUrl);
      const feePayer = Keypair.fromSecretKey(Buffer.from(feePayerSecret, "base64"));
      
      const transaction = Transaction.from(Buffer.from(transactionB64, "base64"));
      
      if (nonceAccountPubkey) {
        const nonceAccount = await connection.getNonceAndContext(new PublicKey(nonceAccountPubkey));
        if (nonceAccount.value) {
          transaction.recentBlockhash = nonceAccount.value.nonce;
        }
      }

      transaction.feePayer = feePayer.publicKey;
      transaction.partialSign(feePayer);

      const sponsoredB64 = transaction.serialize({ requireAllSignatures: false }).toString("base64");

      return {
        tx: sponsoredB64,
        status: "ready",
        feePayer: feePayer.publicKey.toBase58()
      };
    } catch (error: any) {
      throw new AppError(`Solana Sponsorship failed: ${error.message}`, 500, "SOLANA_SPONSOR_FAILED");
    }
  }
}
