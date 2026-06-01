import { FeeSponsor } from "./base";
import { StellarFeeSponsor } from "./stellar";
import { EvmFeeSponsor } from "./evm";
import { SolanaFeeSponsor } from "./solana";

export type ChainId = "stellar" | "evm" | "solana";

export class SponsorFactory {
  static getSponsor(chainId: ChainId): FeeSponsor {
    switch (chainId) {
      case "stellar":
        return new StellarFeeSponsor();
      case "evm":
        return new EvmFeeSponsor();
      case "solana":
        return new SolanaFeeSponsor();
      default:
        throw new Error(`Unsupported chain ID: ${chainId}`);
    }
  }
}
