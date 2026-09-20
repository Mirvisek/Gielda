import { z } from "zod";
import { SourceTier } from "@prisma/client";

/**
 * Zod Schema dla ustrukturyzowanej analizy artykułu prasowego przez LLM.
 * OWASP: Walidacja typów i zakresów wartości po stronie aplikacji.
 */
export const NewsAnalysisSchema = z.object({
  // Wynik sentymentu od -1.0 (skrajnie niedźwiedzi/negatywny) do +1.0 (skrajnie byczy/pozytywny)
  sentimentScore: z.number().min(-1).max(1),

  // Zwięzłe podsumowanie w 1-3 zdaniach
  summary: z.string().max(1000),

  // Symbole giełdowe powiązane z artykułem (walidowane następnie względem bazy Asset)
  mentionedTickers: z
    .array(z.string().regex(/^[A-Z0-9.-]{1,10}$/))
    .default([]),

  // Typ zdarzenia rynkowego / makroekonomicznego
  eventType: z
    .enum([
      "MACRO",
      "GEOPOLITIC",
      "EARNINGS",
      "CENTRAL_BANK",
      "TRADE_RESTRICTION",
      "COMMODITY_SHOCK",
    ])
    .default("MACRO"),

  // Dotkliwość / waga zdarzenia
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),

  // Potencjalne konsekwencje rynkowe
  economicConsequences: z.string().max(1000).optional(),

  // Poziom pewności modelu co do powyższej analizy (0.0 - 1.0)
  confidence: z.number().min(0).max(1).default(0.8),

  // Mapa istotności powiązania poszczególnych spółek (ticker -> waga 0.0 do 1.0)
  tickerRelevance: z.record(z.string(), z.number().min(0).max(1)).default({}),
});

export type NewsAnalysisResult = z.infer<typeof NewsAnalysisSchema>;

export interface ArticleAnalysisInput {
  id: string;
  title: string;
  content: string;
  source: string;
  tier: SourceTier;
  publishedAt: Date;
}

export interface IAIProvider {
  readonly name: string;
  readonly model: string;
  analyzeNewsArticle(input: ArticleAnalysisInput): Promise<NewsAnalysisResult>;
  healthCheck?(): Promise<boolean>;
}
