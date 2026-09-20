import { describe, it, expect } from "vitest";
import { factorEngine } from "@/lib/scoring/factor-engine";
import { extractTechnicalFactors } from "@/lib/scoring/technical-factors";
import { extractNewsFactors, RawNewsItemForScoring } from "@/lib/scoring/news-factors";
import { TechnicalIndicators } from "@/lib/market/types";

describe("Factor Engine & Factor Normalization", () => {
  const mockIndicators: TechnicalIndicators = {
    currentPrice: 150,
    rsi14: 65,
    sma20: 145,
    sma50: 140,
    sma200: 130,
    ema20: 148,
    atr14: 3.5,
    return1d: 1.2,
    return5d: 3.5,
    return20d: 7.8,
    return60d: 15.2,
    volumeChangePercent: 5.4,
    volumeRatio20d: 1.4,
  };

  describe("extractTechnicalFactors", () => {
    it("should normalize all factors within [-1.0, +1.0]", () => {
      const factors = extractTechnicalFactors(mockIndicators);
      expect(factors.length).toBeGreaterThan(0);

      for (const factor of factors) {
        expect(factor.normalizedValue).toBeGreaterThanOrEqual(-1.0);
        expect(factor.normalizedValue).toBeLessThanOrEqual(1.0);
        expect(factor.weight).toBeGreaterThan(0);
        expect(factor.confidence).toBeGreaterThanOrEqual(0);
        expect(factor.confidence).toBeLessThanOrEqual(1.0);
        expect(["POSITIVE", "NEGATIVE", "NEUTRAL"]).toContain(factor.direction);
      }
    });

    it("should correctly handle overbought and oversold RSI", () => {
      const overbought = extractTechnicalFactors({ ...mockIndicators, rsi14: 80 });
      const rsiFactorOverbought = overbought.find((f) => f.name === "RSI_14");
      expect(rsiFactorOverbought).toBeDefined();
      expect(rsiFactorOverbought!.normalizedValue).toBeGreaterThan(0);
      expect(rsiFactorOverbought!.direction).toBe("POSITIVE");

      const oversold = extractTechnicalFactors({ ...mockIndicators, rsi14: 20 });
      const rsiFactorOversold = oversold.find((f) => f.name === "RSI_14");
      expect(rsiFactorOversold).toBeDefined();
      expect(rsiFactorOversold!.normalizedValue).toBeLessThan(0);
      expect(rsiFactorOversold!.direction).toBe("NEGATIVE");
    });

    it("should handle null indicators gracefully without crashing", () => {
      const sparseIndicators: TechnicalIndicators = {
        currentPrice: 100,
        rsi14: null,
        sma20: null,
        sma50: null,
        sma200: null,
        ema20: null,
        atr14: null,
        return1d: null,
        return5d: null,
        return20d: null,
        return60d: null,
        volumeChangePercent: null,
        volumeRatio20d: null,
      };

      const factors = extractTechnicalFactors(sparseIndicators);
      expect(factors).toBeDefined();
      expect(Array.isArray(factors)).toBe(true);
    });
  });

  describe("extractNewsFactors & Cluster Deduplication", () => {
    it("should return a neutral factor with low confidence when news array is empty", () => {
      const factors = extractNewsFactors([]);
      expect(factors).toHaveLength(1);
      expect(factors[0].name).toBe("NEWS_SENTIMENT");
      expect(factors[0].normalizedValue).toBe(0.0);
      expect(factors[0].confidence).toBeLessThanOrEqual(0.3);
      expect(factors[0].direction).toBe("NEUTRAL");
    });

    it("should deduplicate syndicated articles under the same cluster to avoid bias", () => {
      const now = new Date();
      // 3 syndicated copies of the same bullish press release
      const clusteredNews: RawNewsItemForScoring[] = [
        {
          id: "news-1",
          sentimentScore: 0.8,
          sourceReliabilityScore: 90,
          duplicateOfId: "cluster-root-1",
          publishedAt: now,
        },
        {
          id: "news-2",
          sentimentScore: 0.85,
          sourceReliabilityScore: 70,
          duplicateOfId: "cluster-root-1",
          publishedAt: now,
        },
        {
          id: "news-3",
          sentimentScore: 0.75,
          sourceReliabilityScore: 60,
          duplicateOfId: "cluster-root-1",
          publishedAt: now,
        },
        // 1 independent bearish news
        {
          id: "news-4",
          sentimentScore: -0.7,
          sourceReliabilityScore: 90,
          duplicateOfId: null,
          publishedAt: now,
        },
      ];

      const factors = extractNewsFactors(clusteredNews);
      const sentimentFactor = factors.find((f) => f.name === "NEWS_SENTIMENT");
      expect(sentimentFactor).toBeDefined();

      // Because cluster-root-1 is collapsed to 1 representative, the single bearish news (rel 90)
      // balances the single bullish cluster (rel 90), rather than being 3-to-1 overwhelmed
      expect(sentimentFactor!.normalizedValue).toBeCloseTo(0.08, 1);
    });

    it("should give higher weight to Tier 1 sources compared to lower tiers", () => {
      const now = new Date();
      const newsWithReliability: RawNewsItemForScoring[] = [
        {
          id: "high-tier",
          sentimentScore: 0.9,
          sourceReliabilityScore: 95,
          duplicateOfId: null,
          publishedAt: now,
        },
        {
          id: "low-tier",
          sentimentScore: -0.9,
          sourceReliabilityScore: 30,
          duplicateOfId: null,
          publishedAt: now,
        },
      ];

      const factors = extractNewsFactors(newsWithReliability);
      const sentimentFactor = factors.find((f) => f.name === "NEWS_SENTIMENT");
      expect(sentimentFactor).toBeDefined();
      // High tier positive sentiment should dominate low tier negative sentiment
      expect(sentimentFactor!.normalizedValue).toBeGreaterThan(0.3);
    });
  });

  describe("FactorEngine (Look-Ahead Bias Protection)", () => {
    it("should strictly filter out news published after asOfTimestamp", () => {
      const cutoff = new Date("2026-06-01T12:00:00Z");
      const beforeNews: RawNewsItemForScoring = {
        id: "past-news",
        sentimentScore: 0.8,
        sourceReliabilityScore: 90,
        duplicateOfId: null,
        publishedAt: new Date("2026-06-01T10:00:00Z"),
      };
      const futureNews: RawNewsItemForScoring = {
        id: "future-news",
        sentimentScore: -0.9,
        sourceReliabilityScore: 95,
        duplicateOfId: null,
        publishedAt: new Date("2026-06-01T14:00:00Z"), // After cutoff!
      };

      const factors = factorEngine.generateFactors({
        symbol: "AAPL",
        indicators: mockIndicators,
        news: [beforeNews, futureNews],
        asOfTimestamp: cutoff,
      });

      const sentimentFactor = factors.find((f) => f.name === "NEWS_SENTIMENT");
      expect(sentimentFactor).toBeDefined();
      // Future bearish news must NOT leak into scoring!
      expect(sentimentFactor!.normalizedValue).toBeGreaterThan(0.5);
    });
  });
});
