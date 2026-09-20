import { describe, it, expect } from "vitest";
import { MockAIProvider } from "../lib/ai/providers/mock-provider";
import { NewsAnalysisSchema } from "../lib/ai/types";
import { getAIProvider, resetAIProvider } from "../lib/ai/providers";
import { SourceTier } from "@prisma/client";

describe("Wielodostawcza Warstwa AI (IAIProvider) i Walidacja Zod", () => {
  it("MockAIProvider generuje poprawną analizę artykułu zgodną ze schematem", async () => {
    const provider = new MockAIProvider("test-model");
    expect(provider.name).toBe("mock");
    expect(provider.model).toBe("test-model");

    const result = await provider.analyzeNewsArticle({
      id: "news-1",
      title: "Apple and NVIDIA surge as quarterly earnings beat expectations",
      content: "Both companies showed massive revenue growth in data centers and consumer tech.",
      source: "CNBC",
      tier: SourceTier.SECONDARY,
      publishedAt: new Date(),
    });

    expect(result.sentimentScore).toBeGreaterThan(0);
    expect(result.mentionedTickers).toContain("AAPL");
    expect(result.mentionedTickers).toContain("NVDA");
    expect(result.eventType).toBe("EARNINGS");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.summary).toBeDefined();
  });

  it("MockAIProvider poprawnie identyfikuje wydarzenia banków centralnych i geopolityczne", async () => {
    const provider = new MockAIProvider();

    const fedResult = await provider.analyzeNewsArticle({
      id: "news-2",
      title: "Jerome Powell indicates Federal Reserve interest rate cut delay",
      content: "Inflation remains persistent, pushing back expected policy easing.",
      source: "Federal Reserve",
      tier: SourceTier.PRIMARY,
      publishedAt: new Date(),
    });

    expect(fedResult.eventType).toBe("CENTRAL_BANK");

    const geoResult = await provider.analyzeNewsArticle({
      id: "news-3",
      title: "Geopolitical conflict threatens oil supply in Strait of Hormuz",
      content: "Rising tensions cause oil tanker shipping warnings.",
      source: "Reuters",
      tier: SourceTier.SECONDARY,
      publishedAt: new Date(),
    });

    expect(geoResult.eventType).toBe("GEOPOLITIC");
    expect(geoResult.sentimentScore).toBeLessThan(0);
  });

  it("Zod Schema odrzuca nieprawidłowe wartości sentymentu i pewności", () => {
    const invalidSentiment = {
      sentimentScore: 3.5, // Poza zakresem [-1, 1]
      summary: "Test summary",
      mentionedTickers: ["AAPL"],
      eventType: "MACRO",
      severity: "MEDIUM",
      confidence: 0.8,
    };

    expect(() => NewsAnalysisSchema.parse(invalidSentiment)).toThrow();

    const invalidConfidence = {
      sentimentScore: 0.5,
      summary: "Test summary",
      mentionedTickers: ["AAPL"],
      eventType: "MACRO",
      severity: "MEDIUM",
      confidence: 1.5, // Poza zakresem [0, 1]
    };

    expect(() => NewsAnalysisSchema.parse(invalidConfidence)).toThrow();

    const invalidEventType = {
      sentimentScore: 0.5,
      summary: "Test summary",
      mentionedTickers: ["AAPL"],
      eventType: "UNKNOWN_EVENT_TYPE", // Nieprawidłowy enum
      severity: "MEDIUM",
      confidence: 0.8,
    };

    expect(() => NewsAnalysisSchema.parse(invalidEventType)).toThrow();
  });

  it("fabryka getAIProvider honoruje parametry konfiguracyjne", () => {
    resetAIProvider();
    const mockProvider = getAIProvider("mock", "custom-mock-v2");
    expect(mockProvider.name).toBe("mock");
    expect(mockProvider.model).toBe("custom-mock-v2");
  });
});
