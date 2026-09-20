import { describe, it, expect } from "vitest";
import { aiThesisEngine } from "@/lib/scoring/ai-thesis";
import { SignalThesisSchema, ScoreBreakdown } from "@/lib/scoring/types";
import { SignalStatus, TimeHorizon } from "@prisma/client";

describe("AI Thesis Engine (Locked Scores & Defense)", () => {
  const mockBreakdown: ScoreBreakdown = {
    opportunityScore: 78,
    riskScore: 35,
    confidenceScore: 82,
    direction: "POSITIVE",
    status: SignalStatus.ACTIVE,
    timeHorizon: TimeHorizon.HORIZON_1_MONTH,
    factors: [
      {
        name: "RSI_14",
        category: "TECHNICAL",
        value: 64,
        normalizedValue: 0.55,
        weight: 0.15,
        confidence: 1.0,
        direction: "POSITIVE",
        source: "TECHNICAL",
        description: "Wskaźnik RSI(14) wynosi 64.0 i wskazuje stabilną przewagę kupujących.",
      },
      {
        name: "NEWS_SENTIMENT",
        category: "NEWS",
        value: 0.72,
        normalizedValue: 0.72,
        weight: 0.25,
        confidence: 0.85,
        direction: "POSITIVE",
        source: "NEWS",
        description: "Pozytywny sentyment doniesień agencyjnych (wyniki powyżej oczekiwań).",
      },
    ],
  };

  it("should generate a deterministic thesis that strictly conforms to SignalThesisSchema", () => {
    const thesis = aiThesisEngine.generateDeterministicFallback({
      symbol: "NVDA",
      currentPrice: 120.5,
      breakdown: mockBreakdown,
    });

    const parsed = SignalThesisSchema.safeParse(thesis);
    expect(parsed.success).toBe(true);

    expect(thesis.bullCase).toBeTruthy();
    expect(thesis.bearCase).toBeTruthy();
    expect(Array.isArray(thesis.catalysts)).toBe(true);
    expect(thesis.catalysts.length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(thesis.invalidators)).toBe(true);
    expect(thesis.invalidators.length).toBeGreaterThanOrEqual(2);
    expect(thesis.summary).toBeTruthy();
  });

  it("should generate thesis via generateThesis() using MockAI provider fallback", async () => {
    const thesis = await aiThesisEngine.generateThesis({
      symbol: "AAPL",
      currentPrice: 225.0,
      breakdown: mockBreakdown,
      recentNewsHeadlines: [
        "Apple announces new AI integration in next OS release",
        "Quarterly services revenue grows 14% year-over-year",
      ],
    });

    expect(thesis).toBeDefined();
    expect(thesis.bullCase).toContain("AAPL");
    expect(thesis.catalysts.length).toBeGreaterThanOrEqual(2);
    expect(thesis.invalidators.length).toBeGreaterThanOrEqual(2);
  });

  it("should formulate appropriate summaries based on status and direction", () => {
    const insufficientConfBreakdown: ScoreBreakdown = {
      ...mockBreakdown,
      confidenceScore: 30,
      status: SignalStatus.INSUFFICIENT_CONFIDENCE,
      direction: "NEUTRAL",
    };

    const thesis = aiThesisEngine.generateDeterministicFallback({
      symbol: "MSFT",
      currentPrice: 400.0,
      breakdown: insufficientConfBreakdown,
    });

    expect(thesis.summary).toContain("Brak wystarczającej pewności");
  });
});
