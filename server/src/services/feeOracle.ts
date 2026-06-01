import { priceService } from "./priceService";

export class FeeOracle {
  async estimate(chain: string, ops: number) {
    if (chain !== "stellar") {
      throw new Error("Unsupported chain");
    }

    const opCount = Math.max(1, Math.floor(Number(ops) || 1));

    // Stellar base fee: 100 stroops = 0.00001 XLM
    const baseFeeXlm = 0.00001;
    const totalFeeXlm = baseFeeXlm * opCount;

    const priceUsd = await priceService.getTokenPriceUsd("XLM");
    const priceNumber = Number(priceUsd.toString());

    const feeUsd = totalFeeXlm * priceNumber;

    return {
      chain,
      ops: opCount,
      feeXlm: Number(totalFeeXlm.toFixed(8)),
      feeUsd: Number(feeUsd.toFixed(8)),
    };
  }
}

export const feeOracle = new FeeOracle();
