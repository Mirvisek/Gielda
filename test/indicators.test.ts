import { describe, it, expect } from "vitest";
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateATR,
  calculateReturns,
  calculateVolumeMetrics,
  calculateAllTechnicalIndicators,
} from "@/lib/market/indicators";
import { OHLCV } from "@/lib/market/types";

describe("Wskaźniki Techniczne (Technical Engine)", () => {
  describe("SMA (Simple Moving Average)", () => {
    it("should calculate correct SMA on a simple known sequence", () => {
      const prices = [10, 20, 30, 40, 50];
      const sma3 = calculateSMA(prices, 3);

      expect(sma3).toHaveLength(5);
      expect(sma3[0]).toBeNull();
      expect(sma3[1]).toBeNull();
      expect(sma3[2]).toBe(20); // (10 + 20 + 30) / 3
      expect(sma3[3]).toBe(30); // (20 + 30 + 40) / 3
      expect(sma3[4]).toBe(40); // (30 + 40 + 50) / 3
    });

    it("should return nulls when prices length is less than period", () => {
      const prices = [10, 20];
      const sma5 = calculateSMA(prices, 5);
      expect(sma5).toEqual([null, null]);
    });

    it("should return empty array for empty input", () => {
      expect(calculateSMA([], 14)).toEqual([]);
    });
  });

  describe("EMA (Exponential Moving Average)", () => {
    it("should calculate EMA using standard smoothing formula", () => {
      const prices = [10, 11, 12, 13, 14];
      const ema3 = calculateEMA(prices, 3);

      expect(ema3[0]).toBeNull();
      expect(ema3[1]).toBeNull();
      // Pierwszy element to SMA(3) = (10 + 11 + 12) / 3 = 11
      expect(ema3[2]).toBe(11);

      // Następny: alpha = 2 / (3 + 1) = 0.5
      // EMA_4 = 13 * 0.5 + 11 * 0.5 = 12
      expect(ema3[3]).toBe(12);

      // EMA_5 = 14 * 0.5 + 12 * 0.5 = 13
      expect(ema3[4]).toBe(13);
    });
  });

  describe("RSI (Wilder's Relative Strength Index)", () => {
    it("should return 100 when all price changes are strictly positive", () => {
      const strictlyUp = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
      const rsi = calculateRSI(strictlyUp, 14);

      expect(rsi[14]).toBe(100);
      expect(rsi[15]).toBe(100);
    });

    it("should return 0 when all price changes are strictly negative", () => {
      const strictlyDown = [30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15];
      const rsi = calculateRSI(strictlyDown, 14);

      expect(rsi[14]).toBe(0);
      expect(rsi[15]).toBe(0);
    });

    it("should safely handle insufficient candles", () => {
      const short = [10, 11, 12];
      const rsi = calculateRSI(short, 14);
      expect(rsi).toHaveLength(3);
      expect(rsi.every((v) => v === null)).toBe(true);
    });
  });

  describe("ATR (Average True Range)", () => {
    it("should calculate ATR on candles", () => {
      const mockCandles: OHLCV[] = [
        { timestamp: new Date(), open: 10, high: 12, low: 9, close: 11, volume: 100 }, // TR = 12 - 9 = 3
        { timestamp: new Date(), open: 11, high: 13, low: 10, close: 12, volume: 100 }, // TR = max(3, |13-11|=2, |10-11|=1) = 3
        { timestamp: new Date(), open: 12, high: 14, low: 11, close: 13, volume: 100 }, // TR = max(3, |14-12|=2, |11-12|=1) = 3
      ];

      const atr2 = calculateATR(mockCandles, 2);
      expect(atr2[0]).toBeNull();
      expect(atr2[1]).toBe(3);
      expect(atr2[2]).toBe(3);
    });
  });

  describe("Returns and Volume Metrics", () => {
    it("should calculate percentage returns accurately", () => {
      const prices = [100, 102, 105, 104, 110, 120];
      const res = calculateReturns(prices);

      // return1d: (120 - 110) / 110 * 100 = 9.09%
      expect(res.return1d).toBe(9.09);

      // return5d: (120 - 100) / 100 * 100 = 20.00%
      expect(res.return5d).toBe(20);

      // return20d not enough data
      expect(res.return20d).toBeNull();
    });

    it("should calculate volume change percent and ratio", () => {
      const candles: OHLCV[] = Array.from({ length: 25 }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 86400000),
        open: 100,
        high: 105,
        low: 95,
        close: 100,
        volume: 1000,
      }));

      // Set last volume to 2000
      candles[24].volume = 2000;
      const volMetrics = calculateVolumeMetrics(candles);

      // (2000 - 1000) / 1000 * 100 = 100%
      expect(volMetrics.volumeChangePercent).toBe(100);
      // SMA20 of volume is approx 1050, so ratio > 1.8x
      expect(volMetrics.volumeRatio20d).toBeGreaterThan(1.8);
    });

    it("should handle empty or single candle without errors", () => {
      const single: OHLCV[] = [
        { timestamp: new Date(), open: 10, high: 11, low: 9, close: 10, volume: 100 },
      ];
      const ind = calculateAllTechnicalIndicators(single);
      expect(ind.currentPrice).toBe(10);
      expect(ind.rsi14).toBeNull();
      expect(ind.sma20).toBeNull();
    });
  });
});
