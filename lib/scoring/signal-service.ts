import prisma from "@/lib/db/prisma";
import { marketService } from "@/lib/market/market-service";
import { newsService } from "@/lib/news/news-service";
import { factorEngine } from "./factor-engine";
import { scoringEngine } from "./scoring-engine";
import { aiThesisEngine } from "./ai-thesis";
import { GeneratedSignal } from "./types";
import { getFromCache, setInCache } from "@/lib/market/cache";
import { TimeHorizon } from "@prisma/client";

export class SignalService {
  /**
   * Generuje lub pobiera z bufora aktualny sygnał dla wybranego symbolu.
   */
  async getOrGenerateSignal(symbol: string, forceRefresh = false): Promise<GeneratedSignal> {
    const normSymbol = symbol.trim().toUpperCase();
    const cacheKey = `signal:${normSymbol}`;

    // 1. Sprawdź bufor jeśli nie wymuszono odświeżenia
    if (!forceRefresh) {
      const cached = await getFromCache<GeneratedSignal>(cacheKey);
      if (cached) {
        return {
          ...cached,
          timestamp: new Date(cached.timestamp),
        };
      }
    }

    // 2. Pobierz lub utwórz aktywo
    const asset = await marketService.getOrCreateAsset(normSymbol);

    // 3. Pobierz wskaźniki techniczne i bieżący kurs
    const [quote, indicators, recentNews] = await Promise.all([
      marketService.getQuote(normSymbol),
      marketService.getTechnicalIndicators(normSymbol, "1d"),
      newsService.getNewsForAsset(normSymbol, 10),
    ]);

    // 4. Przygotuj surowe wiadomości dla Factor Engine
    const newsForFactors = recentNews.map((n) => {
      const na = n.newsAssets?.[0];
      return {
        id: n.id,
        sentimentScore: n.sentimentScore !== null ? Number(n.sentimentScore) : null,
        sourceReliabilityScore: n.sourceReliabilityScore,
        duplicateOfId: n.duplicateOfId,
        publishedAt: n.publishedAt,
        relevance: na?.relevance !== undefined ? Number(na.relevance) : 0.8,
        confidence: na?.confidence !== undefined ? Number(na.confidence) : 0.8,
      };
    });

    // 5. Wygeneruj czynniki (Factor Engine)
    const factors = factorEngine.generateFactors({
      symbol: normSymbol,
      indicators,
      news: newsForFactors,
      asOfTimestamp: new Date(),
    });

    // 6. Przeprowadź deterministyczny scoring i klasyfikację (Scoring Engine)
    const breakdown = scoringEngine.evaluate(factors, TimeHorizon.HORIZON_1_MONTH);

    // 7. Wygeneruj tezę AI (Bull Case, Bear Case, Catalysts, Invalidators)
    const thesis = await aiThesisEngine.generateThesis({
      symbol: normSymbol,
      currentPrice: quote.price,
      breakdown,
      recentNewsHeadlines: recentNews.map((n) => n.title),
    });

    const now = new Date();

    // 8. Atomowy zapis do bazy MariaDB (Signal + SignalFactor + Prediction)
    await prisma.$transaction(async (tx) => {
      // A. Zapisz Signal
      const sig = await tx.signal.create({
        data: {
          assetId: asset.id,
          timestamp: now,
          direction: breakdown.direction,
          opportunityScore: breakdown.opportunityScore,
          riskScore: breakdown.riskScore,
          confidenceScore: breakdown.confidenceScore,
          status: breakdown.status,
          timeHorizon: breakdown.timeHorizon,
          bullThesis: thesis.bullCase,
          bearThesis: thesis.bearCase,
          catalysts: JSON.stringify(thesis.catalysts),
          invalidators: JSON.stringify(thesis.invalidators),
          rawPayload: JSON.stringify({ summary: thesis.summary }),
        },
      });

      // B. Zapisz SignalFactors
      if (factors.length > 0) {
        await tx.signalFactor.createMany({
          data: factors.map((f) => ({
            signalId: sig.id,
            name: f.name,
            factorCategory: f.category,
            value: f.value,
            normalizedValue: f.normalizedValue,
            factorWeight: f.weight,
            confidence: f.confidence,
            factorDirection: f.direction === "POSITIVE" ? 1 : f.direction === "NEGATIVE" ? -1 : 0,
            source: f.source,
            description: f.description,
          })),
        });
      }

      // C. Zapisz niezmienną prognozę w Prediction Journal (Immutable Record)
      await tx.prediction.create({
        data: {
          assetId: asset.id,
          signalId: sig.id,
          timestamp: now,
          horizonDays: 30, // Horyzont 30 dni (1 miesiąc)
          entryPrice: quote.price,
          predictedDirection: breakdown.direction,
          opportunityScore: breakdown.opportunityScore,
          riskScore: breakdown.riskScore,
          confidence: breakdown.confidenceScore,
          status: breakdown.status,
          thesis: thesis.summary,
          catalysts: JSON.stringify(thesis.catalysts),
          invalidators: JSON.stringify(thesis.invalidators),
          isImmutable: true,
        },
      });

      return sig;
    });

    const generatedSignal: GeneratedSignal = {
      ...breakdown,
      assetId: asset.id,
      symbol: normSymbol,
      currentPrice: quote.price,
      bullThesis: thesis.bullCase,
      bearThesis: thesis.bearCase,
      catalysts: thesis.catalysts,
      invalidators: thesis.invalidators,
      timestamp: now,
    };

    // 9. Zapisz w buforze na 15 minut
    await setInCache(cacheKey, generatedSignal, 15 * 60);

    return generatedSignal;
  }

  /**
   * Pobiera ostatni zapisany sygnał z bazy danych.
   */
  async getLatestDbSignal(symbol: string) {
    const normSymbol = symbol.trim().toUpperCase();

    return prisma.signal.findFirst({
      where: {
        asset: { symbol: normSymbol },
      },
      include: {
        factors: true,
        asset: { select: { id: true, symbol: true, name: true } },
      },
      orderBy: { timestamp: "desc" },
    });
  }
}

export const signalService = new SignalService();
