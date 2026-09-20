import { describe, it, expect } from "vitest";
import {
  validateAndNormalizeCandle,
  validateAndDeduplicateCandles,
} from "@/lib/market/validation";

describe("Walidacja i Normalizacja Świec (Market Ingestion Shield)", () => {
  it("should validate and normalize correct candle", () => {
    const raw = {
      timestamp: "2026-03-15T00:00:00Z",
      open: 150.2,
      high: 155.0,
      low: 149.8,
      close: 154.5,
      volume: 1200000,
    };

    const res = validateAndNormalizeCandle(raw);
    expect(res.valid).toBe(true);
    expect(res.candle?.open).toBe(150.2);
    expect(res.candle?.high).toBe(155.0);
    expect(res.candle?.low).toBe(149.8);
    expect(res.candle?.close).toBe(154.5);
    expect(res.candle?.volume).toBe(1200000);
  });

  it("should reject candle where high < low", () => {
    const corrupted = {
      timestamp: new Date(),
      open: 100,
      high: 90, // Błędne! high < low
      low: 95,
      close: 92,
      volume: 1000,
    };

    const res = validateAndNormalizeCandle(corrupted);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("High (90) jest mniejszy niż Low (95)");
  });

  it("should reject candle where high < max(open, close)", () => {
    const corrupted = {
      timestamp: new Date(),
      open: 100,
      high: 105,
      low: 95,
      close: 110, // Błędne! close > high
      volume: 1000,
    };

    const res = validateAndNormalizeCandle(corrupted);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("High (105) jest mniejszy niż max(Open, Close) (110)");
  });

  it("should reject candle where low > min(open, close)", () => {
    const corrupted = {
      timestamp: new Date(),
      open: 90, // Błędne! open < low
      high: 110,
      low: 95,
      close: 105,
      volume: 1000,
    };

    const res = validateAndNormalizeCandle(corrupted);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Low (95) jest większy niż min(Open, Close) (90)");
  });

  it("should reject negative volume and prices", () => {
    const negVol = {
      timestamp: new Date(),
      open: 100,
      high: 105,
      low: 95,
      close: 100,
      volume: -50,
    };
    expect(validateAndNormalizeCandle(negVol).valid).toBe(false);

    const negPrice = {
      timestamp: new Date(),
      open: -10,
      high: 10,
      low: -20,
      close: 5,
      volume: 100,
    };
    expect(validateAndNormalizeCandle(negPrice).valid).toBe(false);
  });

  it("should deduplicate and sort candles chronologically", () => {
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-01-02T00:00:00Z");
    const t3 = new Date("2026-01-03T00:00:00Z");

    const input = [
      { timestamp: t3, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { timestamp: t1, open: 8, high: 9, low: 7, close: 8.5, volume: 100 },
      { timestamp: t1, open: 8, high: 9, low: 7, close: 8.5, volume: 100 }, // duplikat t1
      { timestamp: t2, open: 9, high: 10, low: 8, close: 9.5, volume: 100 },
    ];

    const cleaned = validateAndDeduplicateCandles(input);
    expect(cleaned).toHaveLength(3);
    expect(cleaned[0].timestamp.getTime()).toBe(t1.getTime());
    expect(cleaned[1].timestamp.getTime()).toBe(t2.getTime());
    expect(cleaned[2].timestamp.getTime()).toBe(t3.getTime());
  });
});
