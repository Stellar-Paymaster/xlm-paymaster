export interface ExchangeRates {
  [currency: string]: number; // Rate to USD
}

export const DEFAULT_FIAT_TO_USD: ExchangeRates = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.27,
  BRL: 0.19,
  NGN: 0.00067,
};

export const DEFAULT_XLM_TO_USD = 0.12;

export class CurrencyConversionService {
  private cache: { rates: ExchangeRates; xlmPrice: number; lastUpdated: number } | null = null;
  private cacheDurationMs = 60 * 1000; // 1 minute

  constructor(private fetchFn: typeof fetch = fetch) {}

  async getExchangeRates(): Promise<{ fiatToUsd: ExchangeRates; xlmPriceUsd: number }> {
    const now = Date.now();
    if (this.cache && now - this.cache.lastUpdated < this.cacheDurationMs) {
      return { fiatToUsd: this.cache.rates, xlmPriceUsd: this.cache.xlmPrice };
    }

    try {
      const response = await this.fetchFn("https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd");
      
      if (response.status === 429) {
        console.warn("Exchange rate API rate limited (429). Using fallback/cached rates.");
        return this.getFallbackRates();
      }

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data = await response.json();
      const xlmPriceUsd = data?.stellar?.usd;
      if (typeof xlmPriceUsd !== "number" || xlmPriceUsd <= 0) {
        throw new Error("Invalid price data received from API");
      }

      const fiatToUsd = { ...DEFAULT_FIAT_TO_USD };
      
      this.cache = { rates: fiatToUsd, xlmPrice: xlmPriceUsd, lastUpdated: now };
      return { fiatToUsd, xlmPriceUsd };
    } catch (error) {
      console.error("Failed to fetch current exchange rates. Falling back to default rates.", error);
      return this.getFallbackRates();
    }
  }

  private getFallbackRates(): { fiatToUsd: ExchangeRates; xlmPriceUsd: number } {
    if (this.cache) {
      return { fiatToUsd: this.cache.rates, xlmPriceUsd: this.cache.xlmPrice };
    }
    return { fiatToUsd: DEFAULT_FIAT_TO_USD, xlmPriceUsd: DEFAULT_XLM_TO_USD };
  }

  async convertFiatToXlm(
    fiatAmount: number,
    fiatCurrency: string
  ): Promise<{
    xlmAmount: number;
    stroops: bigint;
    fiatToUsdRate: number;
    xlmToUsdRate: number;
  }> {
    const currencyUpper = fiatCurrency.toUpperCase();
    
    if (fiatAmount <= 0) {
      throw new Error("Amount must be positive");
    }

    const { fiatToUsd, xlmPriceUsd } = await this.getExchangeRates();
    
    const fiatToUsdRate = fiatToUsd[currencyUpper];
    if (fiatToUsdRate === undefined) {
      throw new Error(`Unsupported fiat currency: ${fiatCurrency}`);
    }

    // Amount in USD
    const usdAmount = fiatAmount * fiatToUsdRate;
    // Amount in XLM
    const xlmAmount = usdAmount / xlmPriceUsd;
    // Amount in stroops (1 XLM = 10,000,000 stroops)
    const stroops = BigInt(Math.round(xlmAmount * 10_000_000));

    return {
      xlmAmount,
      stroops,
      fiatToUsdRate,
      xlmToUsdRate: xlmPriceUsd,
    };
  }
}
