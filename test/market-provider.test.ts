import { describe, it, expect } from "vitest";
import { getMarketDataProvider } from "@/lib/market/providers";
import { getFromCache, setInCache, CACHE_TTL } from "@/lib/market/cache";

describe("Warstwa Dostawców Rynkowych i Buforowania", () => {
  describe("Market Data Provider Factory", () => {
    it("should instantiate YahooFinanceProvider by default", () => {
      const provider = getMarketDataProvider("yahoo");
      expect(provider.name).toBe("yahoo");
    });

    it("should instantiate alternative providers when requested", () => {
      const fmp = getMarketDataProvider("fmp");
      expect(fmp.name).toBe("fmp");

      const polygon = getMarketDataProvider("polygon");
      expect(polygon.name).toBe("polygon");

      const av = getMarketDataProvider("alphavantage");
      expect(av.name).toBe("alphavantage");
    });
  });

  describe("Redis / In-Memory Cache", () => {
    it("should cache and retrieve market quotes with TTL", async () => {
      const testQuote = {
        symbol: "TEST",
        price: 150.5,
        change: 2.5,
        changePercent: 1.69,
        volume: 50000,
        high: 151.0,
        low: 148.0,
        open: 148.5,
        previousClose: 148.0,
        timestamp: new Date(),
        currency: "USD",
        source: "test",
      };

      await setInCache("quote:TEST", testQuote, CACHE_TTL.QUOTE);

      const cached = await getFromCache<typeof testQuote>("quote:TEST");
      expect(cached).not.toBeNull();
      expect(cached?.symbol).toBe("TEST");
      expect(cached?.price).toBe(150.5);
    });

    it("should return null on cache miss", async () => {
      const missed = await getFromCache("non_existent_key_12345");
      expect(missed).toBeNull();
    });
  });
});
