import { describe, it, expect, vi } from "vitest";
import { CurrencyConversionService, DEFAULT_FIAT_TO_USD, DEFAULT_XLM_TO_USD } from "./currencyConversion";

describe("CurrencyConversionService", () => {
  it("should successfully convert USD to XLM with default/cached rates", async () => {
    // Mock fetch to return successful XLM price from CoinGecko
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        stellar: {
          usd: 0.10,
        },
      }),
    } as Response);

    const service = new CurrencyConversionService(mockFetch);
    const result = await service.convertFiatToXlm(10, "USD");

    // 10 USD / 0.10 USD/XLM = 100 XLM
    expect(result.xlmAmount).toBe(100);
    // 100 XLM * 10,000,000 stroops/XLM = 1,000,000,000 stroops
    expect(result.stroops).toBe(1000000000n);
    expect(result.fiatToUsdRate).toBe(1.0);
    expect(result.xlmToUsdRate).toBe(0.10);
  });

  it("should successfully convert BRL to XLM", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        stellar: {
          usd: 0.19, // 0.19 USD/XLM
        },
      }),
    } as Response);

    const service = new CurrencyConversionService(mockFetch);
    const result = await service.convertFiatToXlm(100, "BRL");

    // 100 BRL * 0.19 USD/BRL = 19 USD
    // 19 USD / 0.19 USD/XLM = 100 XLM
    expect(result.xlmAmount).toBe(100);
    expect(result.stroops).toBe(1000000000n);
    expect(result.fiatToUsdRate).toBe(DEFAULT_FIAT_TO_USD.BRL);
  });

  it("should successfully convert NGN to XLM", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        stellar: {
          usd: 0.10,
        },
      }),
    } as Response);

    const service = new CurrencyConversionService(mockFetch);
    const result = await service.convertFiatToXlm(10000, "NGN");

    // 10000 NGN * 0.00067 USD/NGN = 6.7 USD
    // 6.7 USD / 0.10 USD/XLM = 67 XLM
    // 67 XLM = 670,000,000 stroops
    expect(result.xlmAmount).toBe(67);
    expect(result.stroops).toBe(670000000n);
  });

  it("should handle 429 rate limits and fall back to default rates", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as Response);

    const service = new CurrencyConversionService(mockFetch);
    // Should fallback to default XLM price = 0.12 USD
    // 12 USD / 0.12 USD/XLM = 100 XLM
    const result = await service.convertFiatToXlm(12, "USD");
    expect(result.xlmAmount).toBe(100);
    expect(result.xlmToUsdRate).toBe(DEFAULT_XLM_TO_USD);
  });

  it("should handle general network errors and fall back to default rates", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network connection error"));

    const service = new CurrencyConversionService(mockFetch);
    // Should fallback to default XLM price = 0.12 USD
    const result = await service.convertFiatToXlm(12, "USD");
    expect(result.xlmAmount).toBe(100);
    expect(result.xlmToUsdRate).toBe(DEFAULT_XLM_TO_USD);
  });

  it("should throw error for unsupported currencies", async () => {
    const mockFetch = vi.fn();
    const service = new CurrencyConversionService(mockFetch);
    await expect(service.convertFiatToXlm(10, "XYZ")).rejects.toThrow("Unsupported fiat currency: XYZ");
  });

  it("should throw error for negative or zero amounts", async () => {
    const mockFetch = vi.fn();
    const service = new CurrencyConversionService(mockFetch);
    await expect(service.convertFiatToXlm(-5, "USD")).rejects.toThrow("Amount must be positive");
    await expect(service.convertFiatToXlm(0, "USD")).rejects.toThrow("Amount must be positive");
  });
});
