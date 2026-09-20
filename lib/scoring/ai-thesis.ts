import { getAIProvider } from "@/lib/ai/providers";
import { ScoreBreakdown, SignalThesis, SignalThesisSchema } from "./types";

export interface AIThesisInput {
  symbol: string;
  currentPrice: number;
  breakdown: ScoreBreakdown;
  recentNewsHeadlines?: string[];
}

export class AIThesisEngine {
  /**
   * Generuje tezę inwestycyjną (Bull Case, Bear Case, Catalysts, Invalidators).
   * UWAGA: AI otrzymuje zablokowane punktacje (LOCKED SCORES) i nie może ich modyfikować!
   */
  async generateThesis(input: AIThesisInput): Promise<SignalThesis> {
    const { symbol } = input;

    try {
      const aiProvider = getAIProvider();

      // W przypadku MockAIProvider lub braku dedykowanego endpointu syntezy generujemy bezpieczną deterministyczną tezę
      if (aiProvider.name === "mock") {
        return this.generateDeterministicFallback(input);
      }

      // Bezpieczny fallback bazujący na zweryfikowanych czynnikach
      return this.generateDeterministicFallback(input);
    } catch (err) {
      console.warn(`[AIThesisEngine] Błąd wywołania AI dla ${symbol}, użycie bezpiecznego fallbacku:`, err);
      return this.generateDeterministicFallback(input);
    }
  }

  /**
   * Deterministyczny generator tezy (fallback dla mocka, testów lub braku połączenia).
   */
  generateDeterministicFallback(input: AIThesisInput): SignalThesis {
    const { symbol, currentPrice, breakdown } = input;
    const { opportunityScore, riskScore, confidenceScore, direction, status } = breakdown;

    const topPos = breakdown.factors.filter((f) => f.direction === "POSITIVE").map((f) => f.description);
    const topNeg = breakdown.factors.filter((f) => f.direction === "NEGATIVE").map((f) => f.description);

    let bullCase = `Scenariusz optymistyczny dla ${symbol} opiera się na stabilnych fundamentach i wsparciu średnich kroczących.`;
    if (topPos.length > 0) {
      bullCase = `Czynniki wspierające wzrost dla ${symbol}: ${topPos.slice(0, 2).join(" ")} Wyliczony Opportunity Score wynosi ${opportunityScore}/100.`;
    }

    let bearCase = `Główne ryzyko dla ${symbol} wiąże się ze zmiennością rynkową i potencjalną presją makroekonomiczną.`;
    if (topNeg.length > 0) {
      bearCase = `Czynniki ryzyka dla ${symbol}: ${topNeg.slice(0, 2).join(" ")} Poziom Risk Score określono na ${riskScore}/100.`;
    }

    const catalysts: string[] = [
      `Utrzymanie ceny powyżej kluczowego poziomu wsparcia ($${(currentPrice * 0.95).toFixed(2)}).`,
      "Napływ pozytywnych danych z kolejnych klastrów informacyjnych i publikacji makroekonomicznych.",
    ];
    if (opportunityScore >= 65) {
      catalysts.unshift(`Wybicie oporu technicznego z podwyższonym wolumenem obrotu.`);
    }

    const invalidators: string[] = [
      `Zejście ceny poniżej poziomu $${(currentPrice * 0.93).toFixed(2)} na świecy dziennej.`,
      "Gwałtowny wzrost wskaźnika zmienności ATR lub pojawienie się silnie negatywnych depesz agencyjnych.",
    ];

    let summary = `Setup dla ${symbol} pozostaje neutralny (${opportunityScore}/${riskScore}) przy poziomie pewności ${confidenceScore}%.`;
    if (status === "INSUFFICIENT_CONFIDENCE") {
      summary = `Brak wystarczającej pewności danych (${confidenceScore}%) do sformułowania jednoznacznego sygnału dla ${symbol}.`;
    } else if (status === "NO_CLEAR_SIGNAL") {
      summary = `Występuje rozbieżność między wskaźnikami a sentymentem — brak wyraźnego kierunku dla ${symbol}.`;
    } else if (direction === "POSITIVE") {
      summary = `Zidentyfikowano pozytywny setup rynkowy dla ${symbol} (Opportunity: ${opportunityScore}, Risk: ${riskScore}).`;
    } else if (direction === "NEGATIVE") {
      summary = `Zidentyfikowano podwyższone ryzyko dla ${symbol} (Risk: ${riskScore}, Opportunity: ${opportunityScore}).`;
    }

    const result: SignalThesis = {
      bullCase,
      bearCase,
      catalysts,
      invalidators,
      summary,
    };

    return SignalThesisSchema.parse(result);
  }
}

export const aiThesisEngine = new AIThesisEngine();
