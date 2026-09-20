import { Factor } from "./types";
import { FactorCategory } from "@prisma/client";

export interface RawNewsItemForScoring {
  id: string;
  sentimentScore: number | null;
  sourceReliabilityScore: number;
  duplicateOfId: string | null;
  publishedAt: Date;
  relevance?: number;
  confidence?: number;
}

/**
 * Przetwarza artykuły prasowe z deduplikacją klastrów i ważeniem wiarygodności źródeł.
 */
export function extractNewsFactors(newsItems: RawNewsItemForScoring[]): Factor[] {
  if (!newsItems || newsItems.length === 0) {
    return [
      {
        name: "NEWS_SENTIMENT",
        category: FactorCategory.NEWS,
        value: 0.0,
        normalizedValue: 0.0,
        weight: 0.15,
        confidence: 0.2, // Niska pewność przy braku wiadomości
        direction: "NEUTRAL",
        source: "NEWS",
        description: "Brak istotnych wiadomości w ostatnim okresie obserwacji.",
      },
    ];
  }

  // 1. Klastrowanie i deduplikacja:
  // Zgrupuj artykuły według klastrów (duplicateOfId || id)
  const clusters = new Map<string, RawNewsItemForScoring[]>();

  for (const item of newsItems) {
    const clusterKey = item.duplicateOfId || item.id;
    const existing = clusters.get(clusterKey) || [];
    existing.push(item);
    clusters.set(clusterKey, existing);
  }

  // 2. Oblicz zagregowany sentyment per klaster (każdy klaster to 1 niezależny głos)
  let totalWeightedSentiment = 0;
  let totalClusterWeight = 0;
  let highTierCount = 0;
  const now = Date.now();

  for (const [, clusterItems] of clusters.entries()) {
    // Wybierz reprezentanta klastra z najwyższym sourceReliabilityScore
    const rep = clusterItems.reduce((prev, curr) =>
      curr.sourceReliabilityScore > prev.sourceReliabilityScore ? curr : prev
    );

    if (rep.sentimentScore === null || isNaN(rep.sentimentScore)) continue;

    // Współczynnik wieku depeszy (decay)
    const ageHours = Math.max(0, (now - new Date(rep.publishedAt).getTime()) / (1000 * 60 * 60));
    let timeDecay = 1.0;
    if (ageHours > 72) timeDecay = 0.4;
    else if (ageHours > 24) timeDecay = 0.7;

    const rel = rep.relevance ?? 0.8;
    const conf = rep.confidence ?? 0.8;
    const reliability = rep.sourceReliabilityScore / 100;

    if (rep.sourceReliabilityScore >= 90) {
      highTierCount++;
    }

    // Waga klastra = wiarygodność źródła * relevancja * pewność * czas
    const clusterWeight = reliability * rel * conf * timeDecay;
    totalWeightedSentiment += rep.sentimentScore * clusterWeight;
    totalClusterWeight += clusterWeight;
  }

  if (totalClusterWeight === 0) {
    return [
      {
        name: "NEWS_SENTIMENT",
        category: FactorCategory.NEWS,
        value: 0.0,
        normalizedValue: 0.0,
        weight: 0.15,
        confidence: 0.3,
        direction: "NEUTRAL",
        source: "NEWS",
        description: "Brak zweryfikowanego sentymentu w klastrach informacyjnych.",
      },
    ];
  }

  const avgSentiment = totalWeightedSentiment / totalClusterWeight;
  let normalizedSentiment = Math.max(-1, Math.min(1, avgSentiment));
  normalizedSentiment = Number(normalizedSentiment.toFixed(4));

  // Pewność zależy od liczby niezależnych klastrów i obecności źródeł PRIMARY
  let confidence = Math.min(1.0, 0.4 + clusters.size * 0.1 + (highTierCount > 0 ? 0.2 : 0));
  confidence = Number(confidence.toFixed(2));

  let direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL" = "NEUTRAL";
  if (normalizedSentiment > 0.15) direction = "POSITIVE";
  else if (normalizedSentiment < -0.15) direction = "NEGATIVE";

  const factors: Factor[] = [
    {
      name: "NEWS_SENTIMENT",
      category: FactorCategory.NEWS,
      value: Number(avgSentiment.toFixed(2)),
      normalizedValue: normalizedSentiment,
      weight: 0.15,
      confidence,
      direction,
      source: "NEWS",
      description: `Ważony sentyment z ${clusters.size} niezależnych klastrów wiadomości: ${avgSentiment.toFixed(2)}.`,
    },
  ];

  // Czynnik ryzyka: jeśli sentyment jest silnie ujemny, dodaj czynnik NEWS_DOWNSIDE_RISK
  if (normalizedSentiment < -0.2) {
    factors.push({
      name: "NEWS_DOWNSIDE_RISK",
      category: FactorCategory.NEWS,
      value: Math.abs(normalizedSentiment),
      normalizedValue: normalizedSentiment, // ujemna wartość = ryzyko
      weight: 0.10,
      confidence,
      direction: "NEGATIVE",
      source: "NEWS",
      description: "Negatywny wydźwięk komunikatów prasowych podnosi poziom ryzyka.",
    });
  }

  return factors;
}
