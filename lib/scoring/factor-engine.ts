import { TechnicalIndicators } from "@/lib/market/types";
import { extractTechnicalFactors } from "./technical-factors";
import { extractNewsFactors, RawNewsItemForScoring } from "./news-factors";
import { Factor } from "./types";

export interface FactorEngineInput {
  symbol: string;
  indicators: TechnicalIndicators;
  news: RawNewsItemForScoring[];
  asOfTimestamp?: Date; // Punkt w czasie (Look-Ahead Bias Defense)
}

export class FactorEngine {
  /**
   * Generuje zunifikowany zbiór znormalizowanych czynników [-1.0, +1.0] dla danego aktywa.
   */
  generateFactors(input: FactorEngineInput): Factor[] {
    const { indicators, news, asOfTimestamp } = input;

    // 1. Ochrona przed Look-Ahead Bias:
    // Odrzuć wiadomości opublikowane po zadanym punkcie w czasie
    const validNews = asOfTimestamp
      ? news.filter((n) => new Date(n.publishedAt).getTime() <= asOfTimestamp.getTime())
      : news;

    // 2. Pobierz czynniki techniczne
    const techFactors = extractTechnicalFactors(indicators);

    // 3. Pobierz czynniki informacyjne z deduplikacją klastrów
    const newsFactors = extractNewsFactors(validNews);

    // 4. Połącz czynniki
    const allFactors = [...techFactors, ...newsFactors];

    return allFactors;
  }
}

export const factorEngine = new FactorEngine();
