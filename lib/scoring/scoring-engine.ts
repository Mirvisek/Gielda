import { Factor, ScoreBreakdown, FactorDirection } from "./types";
import { SCORING_THRESHOLDS } from "./config";
import { FactorCategory, SignalStatus, TimeHorizon } from "@prisma/client";

export class ScoringEngine {
  /**
   * 1. Opportunity Score (0–100) — siła potencjalnego setupu wzrostowego.
   */
  calculateOpportunityScore(factors: Factor[]): number {
    if (!factors || factors.length === 0) return 50;

    let weightedSum = 0;
    let totalWeight = 0;

    for (const f of factors) {
      // Pomiń czynniki czysto związane z podwyższoną zmiennością (należą do Risk Score)
      if (f.name === "VOLATILITY_ATR_RISK" || f.name === "NEWS_DOWNSIDE_RISK") continue;

      // normalizedValue mieści się w [-1.0, +1.0]
      weightedSum += f.normalizedValue * f.weight * f.confidence;
      totalWeight += f.weight;
    }

    if (totalWeight === 0) return 50;

    const avgNormalized = weightedSum / totalWeight; // [-1.0, +1.0]
    // Przekształcenie [-1.0, +1.0] na [0, 100], gdzie 0.0 -> 50 pkt
    const rawScore = 50 + avgNormalized * 50;

    return Math.round(Math.max(0, Math.min(100, rawScore)));
  }

  /**
   * 2. Risk Score (0–100) — niezależny poziom ryzyka i niepewności.
   * Nie jest prostą odwrotnością Opportunity Score!
   */
  calculateRiskScore(factors: Factor[]): number {
    if (!factors || factors.length === 0) return 50;

    let riskContributions = 0;

    for (const f of factors) {
      // 1. Zmienność ATR jako czynnik ryzyka
      if (f.name === "VOLATILITY_ATR_RISK") {
        // f.normalizedValue jest ujemne przy wysokim ATR
        const atrRisk = Math.abs(Math.min(0, f.normalizedValue)); // [0.0, 1.0]
        riskContributions += atrRisk * 35;
      }

      // 2. Negatywne wiadomości i spadek sentymentu
      if (f.category === FactorCategory.NEWS && f.normalizedValue < 0) {
        riskContributions += Math.abs(f.normalizedValue) * 25;
      }

      // 3. Położenie poniżej SMA200 (reżim bessy / trend spadkowy)
      if (f.name === "REGIME_SMA_200" && f.normalizedValue < 0) {
        riskContributions += Math.abs(f.normalizedValue) * 20;
      }

      // 4. Załamanie momentum
      if (f.name === "MOMENTUM_SHORT" && f.normalizedValue < -0.3) {
        riskContributions += Math.abs(f.normalizedValue) * 15;
      }
    }

    // Bazowy poziom ryzyka rynkowego wynosi 20 pkt
    const baseRisk = 20;
    const computed = baseRisk + riskContributions;

    return Math.round(Math.max(0, Math.min(100, computed)));
  }

  /**
   * 3. Confidence Score (0–100) — jakość danych i spójność sygnałów.
   */
  calculateConfidenceScore(factors: Factor[]): number {
    if (!factors || factors.length === 0) return 20;

    // A. Średnia ważona poziomów pewności składowych czynników
    let totalWeightedConf = 0;
    let totalWeight = 0;

    for (const f of factors) {
      totalWeightedConf += f.confidence * f.weight;
      totalWeight += f.weight;
    }

    const avgConf = totalWeight > 0 ? (totalWeightedConf / totalWeight) * 100 : 50;

    // B. Kara za rozbieżność (divergence penalty):
    // Jeśli czynniki techniczne wskazują silny wzrost (+0.6), a wiadomości silny spadek (-0.6),
    // pewność całego systemu spada!
    const techFactors = factors.filter((f) => f.category === FactorCategory.TECHNICAL);
    const newsFactors = factors.filter((f) => f.category === FactorCategory.NEWS && f.name === "NEWS_SENTIMENT");

    let divergencePenalty = 0;
    if (techFactors.length > 0 && newsFactors.length > 0) {
      const avgTech = techFactors.reduce((acc, f) => acc + f.normalizedValue, 0) / techFactors.length;
      const avgNews = newsFactors[0].normalizedValue;

      const diff = Math.abs(avgTech - avgNews);
      if (diff > SCORING_THRESHOLDS.DIVERGENCE_TOLERANCE) {
        divergencePenalty = (diff - SCORING_THRESHOLDS.DIVERGENCE_TOLERANCE) * 40;
      }
    }

    // C. Kara za niekompletność danych (jeśli jest mniej niż 4 czynniki)
    let completenessPenalty = 0;
    if (factors.length < 4) {
      completenessPenalty = (4 - factors.length) * 15;
    }

    const finalScore = avgConf - divergencePenalty - completenessPenalty;
    return Math.round(Math.max(0, Math.min(100, finalScore)));
  }

  /**
   * 4. Klasyfikacja sygnału i kierunku.
   */
  classifySignal(
    opportunityScore: number,
    riskScore: number,
    confidenceScore: number,
    factors: Factor[]
  ): { status: SignalStatus; direction: FactorDirection } {
    // 1. Ochrona: Niski Confidence zawsze prowadzi do INSUFFICIENT_CONFIDENCE
    if (confidenceScore < SCORING_THRESHOLDS.MIN_CONFIDENCE_FOR_SIGNAL) {
      return {
        status: SignalStatus.INSUFFICIENT_CONFIDENCE,
        direction: "NEUTRAL",
      };
    }

    // 2. Ochrona przed sprzecznością czynników:
    // Jeśli technika jest na tak, a news na nie z dużą rozbieżnością
    const techFactors = factors.filter((f) => f.category === FactorCategory.TECHNICAL);
    const newsFactors = factors.filter((f) => f.category === FactorCategory.NEWS && f.name === "NEWS_SENTIMENT");

    if (techFactors.length > 0 && newsFactors.length > 0) {
      const avgTech = techFactors.reduce((acc, f) => acc + f.normalizedValue, 0) / techFactors.length;
      const avgNews = newsFactors[0].normalizedValue;

      // Przeciwne znaki z istotną siłą
      if ((avgTech > 0.3 && avgNews < -0.3) || (avgTech < -0.3 && avgNews > 0.3)) {
        return {
          status: SignalStatus.NO_CLEAR_SIGNAL,
          direction: "NEUTRAL",
        };
      }
    }

    // 3. Pozytywny setup (Bullish Signal)
    if (
      opportunityScore >= SCORING_THRESHOLDS.BULLISH_OPPORTUNITY_MIN &&
      riskScore <= SCORING_THRESHOLDS.BULLISH_RISK_MAX &&
      confidenceScore >= SCORING_THRESHOLDS.BULLISH_CONFIDENCE_MIN
    ) {
      return {
        status: SignalStatus.ACTIVE,
        direction: "POSITIVE",
      };
    }

    // 4. Negatywny setup (Bearish / High Risk Signal)
    if (
      riskScore >= SCORING_THRESHOLDS.BEARISH_RISK_MIN &&
      opportunityScore <= 45 &&
      confidenceScore >= SCORING_THRESHOLDS.BULLISH_CONFIDENCE_MIN
    ) {
      return {
        status: SignalStatus.ACTIVE,
        direction: "NEGATIVE",
      };
    }

    // 5. Neutralny / brak wyraźnego sygnału
    return {
      status: SignalStatus.NO_CLEAR_SIGNAL,
      direction: "NEUTRAL",
    };
  }

  /**
   * Główna metoda wyliczająca kompletny zestaw punktacji dla zestawu czynników.
   */
  evaluate(factors: Factor[], timeHorizon: TimeHorizon = TimeHorizon.HORIZON_1_MONTH): ScoreBreakdown {
    const opportunityScore = this.calculateOpportunityScore(factors);
    const riskScore = this.calculateRiskScore(factors);
    const confidenceScore = this.calculateConfidenceScore(factors);

    const { status, direction } = this.classifySignal(
      opportunityScore,
      riskScore,
      confidenceScore,
      factors
    );

    return {
      opportunityScore,
      riskScore,
      confidenceScore,
      direction,
      status,
      timeHorizon,
      factors,
    };
  }
}

export const scoringEngine = new ScoringEngine();
