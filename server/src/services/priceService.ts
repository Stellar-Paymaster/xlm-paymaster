import Decimal from "decimal.js";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "price_service" });

const COINGECKO_API_URL = "https://api.coingecko.com/api/v3";

const TOKEN_TO_COINGECKO_ID: Record<string, string> = {
  XLM: "stellar",
  ETH: "ethereum",
  SOL: "solana",
  ATOM: "cosmos",
  USDC: "usd-coin",
};

interface CachedPrice {
  price: Decimal;
  fetchedAt: number;
  lastUpdatedAt: number | null;
}

const CACHE_TTL_MS = parseInt(process.env.PRICE_CACHE_TTL_MS || "60000", 10);
const SAFETY_BUFFER = parseFloat(process.env.PRICE_SAFETY_BUFFER || "1.1");

class PriceService {
  private cache: Map<string, CachedPrice> = new Map();

  async getXlmUsdcPrice(): Promise<Decimal> {
    const xlmPrice = await this.getTokenPriceUsd("XLM");
    const usdcPrice = await this.getTokenPriceUsd("USDC");
    return xlmPrice.div(usdcPrice);
  }

  async getTokenPriceQuoteUsd(token: string): Promise<{
    price: Decimal;
    lastUpdatedAt: number | null;
  }> {
    const upperToken = token.toUpperCase();
    const cached = this.cache.get(upperToken);

    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      logger.debug(
        { token: upperToken, price: cached.price.toString(), cache: "hit" },
        "Returning cached price"
      );
      return { price: cached.price, lastUpdatedAt: cached.lastUpdatedAt };
    }

    const coingeckoId = TOKEN_TO_COINGECKO_ID[upperToken];
    if (!coingeckoId) {
      throw new Error(`Unsupported token for price lookup: ${upperToken}`);
    }

    try {
      const response = await fetch(
        `${COINGECKO_API_URL}/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_last_updated_at=true`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API returned ${response.status}`);
      }

      const data = await response.json();
      const priceValue = data[coingeckoId]?.usd;
      const lastUpdatedAt =
        typeof data[coingeckoId]?.last_updated_at === "number"
          ? data[coingeckoId].last_updated_at
          : null;

      if (typeof priceValue !== "number" || priceValue <= 0) {
        throw new Error(`Invalid price data for ${upperToken}`);
      }

      const price = new Decimal(priceValue);

      this.cache.set(upperToken, {
        price,
        fetchedAt: Date.now(),
        lastUpdatedAt,
      });

      logger.info(
        { token: upperToken, price: price.toString(), cache: "miss" },
        "Fetched fresh price from CoinGecko"
      );

      return { price, lastUpdatedAt };
    } catch (error) {
      if (cached) {
        logger.warn(
          { token: upperToken, error, staleness_ms: Date.now() - cached.fetchedAt },
          "CoinGecko fetch failed, using stale cached price"
        );
        return { price: cached.price, lastUpdatedAt: cached.lastUpdatedAt };
      }
      throw error;
    }
  }

  async getTokenPriceUsd(token: string): Promise<Decimal> {
    const quote = await this.getTokenPriceQuoteUsd(token);
    return quote.price;
  }

  calculateRequiredTokenAmount(
    xlmFeeStroops: number,
    xlmPriceUsd: Decimal,
    tokenPriceUsd: Decimal
  ): Decimal {
    const xlmFee = new Decimal(xlmFeeStroops).div(10_000_000);
    const feeValueUsd = xlmFee.mul(xlmPriceUsd);
    const requiredTokens = feeValueUsd.div(tokenPriceUsd);
    return requiredTokens.mul(SAFETY_BUFFER);
  }

  getSafetyBuffer(): number {
    return SAFETY_BUFFER;
  }
}

export const priceService = new PriceService();
