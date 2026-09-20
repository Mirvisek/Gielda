import { describe, it, expect } from "vitest";
import { scoringEngine } from "@/lib/scoring/scoring-engine";
import { Factor } from "@/lib/scoring/types";
import { FactorCategory, SignalStatus } from "@prisma/client";

describe("Scoring Engine", () => {
  const sampleBullishFactors: Factor[] = [
    {
      name: "RSI_14",
      category: FactorCategory.TECHNICAL,
      value: 62,
      normalizedValue: 0.5,
      weight: 0.15,
      confidence: 1.0,
      direction: "POSITIVE",
      source: "TECHNICAL",
      description: "RSI(14) wynosi 62",
    },
    {
      name: "SMA_20_TREND",
      category: FactorCategory.TECHNICAL,
      value: 3.5,
      normalizedValue: 0.6,
      weight: 0.15,
      confidence: 1.0,
      direction: "POSITIVE",
      source: "TECHNICAL",
      description: "Cena powyżej SMA20",
    },
    {
      name: "REGIME_SMA_200",
      category: FactorCategory.MACRO,
      value: 12.0,
      normalizedValue: 0.7,
      weight: 0.15,
      confidence: 1.0,
      direction: "POSITIVE",
      source: "TECHNICAL",
      description: "Reżim hossy powyżej SMA200",
    },
    {
      name: "NEWS_SENTIMENT",
      category: FactorCategory.NEWS,
      value: 0.65,
      normalizedValue: 0.65,
      weight: 0.25,
      confidence: 0.9,
      direction: "POSITIVE",
      source: "NEWS",
      description: "Pozytywny sentyment doniesień",
    },
    {
      name: "VOLATILITY_ATR_RISK",
      category: FactorCategory.TECHNICAL,
      value: 2.0,
      normalizedValue: -0.2, // Low volatility risk
      weight: 0.1,
      confidence: 1.0,
      direction: "NEUTRAL",
      source: "TECHNICAL",
      description: "Niska zmienność ATR",
    },
  ];

  it("should evaluate Opportunity, Risk, and Confidence within [0, 100]", () => {
    const result = scoringEngine.evaluate(sampleBullishFactors);

    expect(result.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(result.opportunityScore).toBeLessThanOrEqual(100);

    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(100);

    expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(result.confidenceScore).toBeLessThanOrEqual(100);

    expect(result.opportunityScore).toBeGreaterThan(60);
    expect(result.riskScore).toBeLessThan(50);
    expect(result.status).toBe(SignalStatus.ACTIVE);
    expect(result.direction).toBe("POSITIVE");
  });

  it("should prove Risk Score is mathematically independent from Opportunity Score", () => {
    // High opportunity, but extremely high volatility risk
    const highOpportunityHighRiskFactors: Factor[] = [
      {
        name: "MOMENTUM_SHORT",
        category: FactorCategory.TECHNICAL,
        value: 15.0,
        normalizedValue: 0.9,
        weight: 0.2,
        confidence: 1.0,
        direction: "POSITIVE",
        source: "TECHNICAL",
        description: "Silne krótkoterminowe momentum",
      },
      {
        name: "NEWS_SENTIMENT",
        category: FactorCategory.NEWS,
        value: 0.7,
        normalizedValue: 0.7,
        weight: 0.3,
        confidence: 0.9,
        direction: "POSITIVE",
        source: "NEWS",
        description: "Bardzo pozytywne wiadomości",
      },
      {
        name: "VOLATILITY_ATR_RISK",
        category: FactorCategory.TECHNICAL,
        value: 8.5,
        normalizedValue: -0.95, // Extreme volatility risk!
        weight: 0.25,
        confidence: 1.0,
        direction: "NEGATIVE",
        source: "TECHNICAL",
        description: "Ekstremalna zmienność ATR",
      },
      {
        name: "REGIME_SMA_200",
        category: FactorCategory.MACRO,
        value: -5.0,
        normalizedValue: -0.6, // Below SMA200 (bear market regime)
        weight: 0.25,
        confidence: 1.0,
        direction: "NEGATIVE",
        source: "TECHNICAL",
        description: "Poniżej SMA200",
      },
    ];

    const result = scoringEngine.evaluate(highOpportunityHighRiskFactors);

    // Both Opportunity and Risk should be elevated simultaneously
    expect(result.opportunityScore).toBeGreaterThan(50);
    expect(result.riskScore).toBeGreaterThan(50);
    // Risk score is NOT (100 - opportunity)
    expect(result.riskScore + result.opportunityScore).not.toBe(100);
  });

  it("should penalize Confidence and yield NO_CLEAR_SIGNAL upon technical vs news divergence", () => {
    const divergentFactors: Factor[] = [
      {
        name: "RSI_14",
        category: FactorCategory.TECHNICAL,
        value: 75,
        normalizedValue: 0.8, // Super bullish technicals
        weight: 0.2,
        confidence: 1.0,
        direction: "POSITIVE",
        source: "TECHNICAL",
        description: "Wykupienie techniczne",
      },
      {
        name: "SMA_20_TREND",
        category: FactorCategory.TECHNICAL,
        value: 5,
        normalizedValue: 0.8,
        weight: 0.2,
        confidence: 1.0,
        direction: "POSITIVE",
        source: "TECHNICAL",
        description: "Cena dynamicznie rośnie nad SMA20",
      },
      {
        name: "NEWS_SENTIMENT",
        category: FactorCategory.NEWS,
        value: -0.85,
        normalizedValue: -0.85, // Disastrous news sentiment
        weight: 0.3,
        confidence: 0.9,
        direction: "NEGATIVE",
        source: "NEWS",
        description: "Negatywne informacje w mediach",
      },
      {
        name: "VOLATILITY_ATR_RISK",
        category: FactorCategory.TECHNICAL,
        value: 2.0,
        normalizedValue: 0.0,
        weight: 0.15,
        confidence: 1.0,
        direction: "NEUTRAL",
        source: "TECHNICAL",
        description: "Umiarkowany ATR",
      },
    ];

    const result = scoringEngine.evaluate(divergentFactors);

    // Divergence should trigger NO_CLEAR_SIGNAL and drop confidence
    expect(result.status).toBe(SignalStatus.NO_CLEAR_SIGNAL);
    expect(result.direction).toBe("NEUTRAL");
  });

  it("should classify as INSUFFICIENT_CONFIDENCE when data confidence is low", () => {
    const lowConfidenceFactors: Factor[] = [
      {
        name: "NEWS_SENTIMENT",
        category: FactorCategory.NEWS,
        value: 0.2,
        normalizedValue: 0.2,
        weight: 0.5,
        confidence: 0.2, // Very low confidence
        direction: "NEUTRAL",
        source: "NEWS",
        description: "Znikome doniesienia medialne",
      },
      {
        name: "RSI_14",
        category: FactorCategory.TECHNICAL,
        value: 52,
        normalizedValue: 0.1,
        weight: 0.5,
        confidence: 0.25,
        direction: "NEUTRAL",
        source: "TECHNICAL",
        description: "RSI blisko neutralnego",
      },
    ];

    const result = scoringEngine.evaluate(lowConfidenceFactors);

    expect(result.confidenceScore).toBeLessThan(40);
    expect(result.status).toBe(SignalStatus.INSUFFICIENT_CONFIDENCE);
    expect(result.direction).toBe("NEUTRAL");
  });
});
