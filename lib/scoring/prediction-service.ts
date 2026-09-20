import prisma from "@/lib/db/prisma";

export interface PredictionQueryParams {
  symbol?: string;
  direction?: string;
  status?: string;
  resolution?: "ALL" | "SUCCESS" | "FAILURE" | "PENDING";
  page?: number;
  limit?: number;
}

export interface CalibrationBucket {
  bucketName: string;
  min: number;
  max: number;
  totalPredictions: number;
  successfulPredictions: number;
  winRatePercent: number;
  avgConfidence: number;
  calibrationGap: number;
  avgOpportunityScore: number;
  avgRiskScore: number;
}

export interface CalibrationStats {
  totalEvaluated: number;
  overallWinRatePercent: number;
  brierScore: number;
  buckets: CalibrationBucket[];
}

export class PredictionService {
  /**
   * Zwraca listę prognoz z dziennika z powiązanymi wynikami.
   */
  async getPredictions(params: PredictionQueryParams = {}) {
    const { symbol, direction, status, resolution, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const whereClause: Record<string, unknown> = {};
    if (symbol) {
      whereClause.asset = { symbol: symbol.trim().toUpperCase() };
    }
    if (direction && direction !== "ALL") {
      whereClause.predictedDirection = direction;
    }
    if (status && status !== "ALL") {
      whereClause.status = status;
    }
    if (resolution && resolution !== "ALL") {
      if (resolution === "SUCCESS") {
        whereClause.result = { isSuccess: true };
      } else if (resolution === "FAILURE") {
        whereClause.result = { isSuccess: false };
      } else if (resolution === "PENDING") {
        whereClause.OR = [
          { result: null },
          { result: { isSuccess: null } },
        ];
      }
    }

    const [items, total] = await Promise.all([
      prisma.prediction.findMany({
        where: whereClause,
        include: {
          asset: { select: { symbol: true, name: true } },
          result: true,
        },
        orderBy: { timestamp: "desc" },
        skip,
        take: limit,
      }),
      prisma.prediction.count({ where: whereClause }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Worker ewaluacji: ocenia dojrzałe prognozy (+1d, +7d, +30d, +90d) względem rzeczywistych cen rynkowych.
   * OCHRONA: Brak Look-Ahead Bias — badamy tylko historyczne ceny po upływie zadanego okresu.
   */
  async evaluateMaturedPredictions(): Promise<{ evaluatedCount: number }> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Znajdź prognozy starsze niż 24h bez pełnego wyniku
    const predictionsToEvaluate = await prisma.prediction.findMany({
      where: {
        timestamp: { lte: oneDayAgo },
        OR: [
          { result: null },
          { result: { actualReturn30d: null } },
        ],
      },
      include: {
        result: true,
      },
      take: 50,
    });

    let evaluatedCount = 0;

    for (const pred of predictionsToEvaluate) {
      const entryPrice = Number(pred.entryPrice);
      if (entryPrice <= 0) continue;

      const predTime = pred.timestamp.getTime();

      // Wyznacz daty punktów ewaluacyjnych
      const target1d = new Date(predTime + 1 * 24 * 60 * 60 * 1000);
      const target7d = new Date(predTime + 7 * 24 * 60 * 60 * 1000);
      const target30d = new Date(predTime + 30 * 24 * 60 * 60 * 1000);
      const target90d = new Date(predTime + 90 * 24 * 60 * 60 * 1000);

      // Pobierz ceny najbliższe docelowym datom (nie wcześniej niż target date)
      const [p1d, p7d, p30d, p90d] = await Promise.all([
        this.findPriceAtOrAfter(pred.assetId, target1d),
        this.findPriceAtOrAfter(pred.assetId, target7d),
        this.findPriceAtOrAfter(pred.assetId, target30d),
        this.findPriceAtOrAfter(pred.assetId, target90d),
      ]);

      const return1d = p1d !== null ? ((p1d - entryPrice) / entryPrice) * 100 : null;
      const return7d = p7d !== null ? ((p7d - entryPrice) / entryPrice) * 100 : null;
      const return30d = p30d !== null ? ((p30d - entryPrice) / entryPrice) * 100 : null;
      const return90d = p90d !== null ? ((p90d - entryPrice) / entryPrice) * 100 : null;

      // Określ sukces prognozy w horyzoncie 30-dniowym (lub 7-dniowym jeśli 30d jeszcze nie nadeszło)
      let isSuccess: boolean | null = null;
      const refReturn = return30d !== null ? return30d : return7d;

      if (refReturn !== null) {
        if (pred.predictedDirection === "POSITIVE") {
          isSuccess = refReturn > 0;
        } else if (pred.predictedDirection === "NEGATIVE") {
          isSuccess = refReturn < 0;
        } else if (pred.predictedDirection === "NEUTRAL") {
          isSuccess = Math.abs(refReturn) < 3.0; // Wahania poniżej 3% traktowane jako sukces tezy neutralnej
        }
      }

      await prisma.predictionResult.upsert({
        where: { predictionId: pred.id },
        update: {
          priceAfter1d: p1d !== null ? p1d : undefined,
          priceAfter7d: p7d !== null ? p7d : undefined,
          priceAfter30d: p30d !== null ? p30d : undefined,
          priceAfter90d: p90d !== null ? p90d : undefined,
          actualReturn1d: return1d !== null ? Number(return1d.toFixed(4)) : undefined,
          actualReturn7d: return7d !== null ? Number(return7d.toFixed(4)) : undefined,
          actualReturn30d: return30d !== null ? Number(return30d.toFixed(4)) : undefined,
          actualReturn90d: return90d !== null ? Number(return90d.toFixed(4)) : undefined,
          evaluatedAt: new Date(),
          isSuccess: isSuccess !== null ? isSuccess : undefined,
        },
        create: {
          predictionId: pred.id,
          priceAfter1d: p1d !== null ? p1d : undefined,
          priceAfter7d: p7d !== null ? p7d : undefined,
          priceAfter30d: p30d !== null ? p30d : undefined,
          priceAfter90d: p90d !== null ? p90d : undefined,
          actualReturn1d: return1d !== null ? Number(return1d.toFixed(4)) : undefined,
          actualReturn7d: return7d !== null ? Number(return7d.toFixed(4)) : undefined,
          actualReturn30d: return30d !== null ? Number(return30d.toFixed(4)) : undefined,
          actualReturn90d: return90d !== null ? Number(return90d.toFixed(4)) : undefined,
          evaluatedAt: new Date(),
          isSuccess: isSuccess !== null ? isSuccess : undefined,
        },
      });

      evaluatedCount++;
    }

    return { evaluatedCount };
  }

  /**
   * Zwraca cenę aktywa z bazy w danym punkcie czasowym (lub najbliższą kolejną).
   */
  private async findPriceAtOrAfter(assetId: string, date: Date): Promise<number | null> {
    if (date.getTime() > Date.now()) {
      return null; // Data jeszcze nie nadeszła
    }

    const priceRec = await prisma.price.findFirst({
      where: {
        assetId,
        timestamp: { gte: date },
      },
      orderBy: { timestamp: "asc" },
      select: { close: true },
    });

    return priceRec ? Number(priceRec.close) : null;
  }

  /**
   * Wylicza metryki kalibracji modelu (Brier score, skuteczność według poziomów pewności).
   */
  async getCalibrationStats(): Promise<CalibrationStats> {
    const evaluated = await prisma.prediction.findMany({
      where: {
        result: {
          isSuccess: { not: null },
        },
      },
      include: {
        result: true,
      },
    });

    if (evaluated.length === 0) {
      return {
        totalEvaluated: 0,
        overallWinRatePercent: 0,
        brierScore: 0,
        buckets: [],
      };
    }

    let successCount = 0;
    let brierSum = 0;

    // Podział na przedziały pewności: 50-65%, 65-80%, 80-100%
    const bucketDefs = [
      { name: "50-65% (Niska/Średnia pewność)", min: 50, max: 65 },
      { name: "65-80% (Wysoka pewność)", min: 65, max: 80 },
      { name: "80-100% (Bardzo wysoka pewność)", min: 80, max: 100 },
    ];

    const bucketsMap = bucketDefs.map((b) => ({
      bucketName: b.name,
      min: b.min,
      max: b.max,
      totalPredictions: 0,
      successfulPredictions: 0,
      sumConfidence: 0,
      sumOpportunity: 0,
      sumRisk: 0,
    }));

    for (const pred of evaluated) {
      const isSuccess = pred.result?.isSuccess === true;
      if (isSuccess) successCount++;

      // Brier score: (forecast_probability - actual_outcome)^2
      const forecastProb = pred.confidence / 100;
      const actualOutcome = isSuccess ? 1 : 0;
      brierSum += Math.pow(forecastProb - actualOutcome, 2);

      // Dopasuj do bucketu (przedziały prawostronnie otwarte, ostatni domknięty)
      for (let i = 0; i < bucketsMap.length; i++) {
        const b = bucketsMap[i];
        const isLast = i === bucketsMap.length - 1;
        const matches = isLast
          ? pred.confidence >= b.min && pred.confidence <= b.max
          : pred.confidence >= b.min && pred.confidence < b.max;

        if (matches) {
          b.totalPredictions++;
          if (isSuccess) b.successfulPredictions++;
          b.sumConfidence += pred.confidence;
          b.sumOpportunity += pred.opportunityScore ?? 50;
          b.sumRisk += pred.riskScore ?? 50;
          break;
        }
      }
    }

    const overallWinRatePercent = Number(((successCount / evaluated.length) * 100).toFixed(1));
    const brierScore = Number((brierSum / evaluated.length).toFixed(4));

    const finalBuckets: CalibrationBucket[] = bucketsMap.map((b) => {
      const winRatePercent =
        b.totalPredictions > 0
          ? Number(((b.successfulPredictions / b.totalPredictions) * 100).toFixed(1))
          : 0;
      const avgConfidence =
        b.totalPredictions > 0 ? Number((b.sumConfidence / b.totalPredictions).toFixed(1)) : 0;
      const calibrationGap =
        b.totalPredictions > 0 ? Number((winRatePercent - avgConfidence).toFixed(1)) : 0;

      return {
        bucketName: b.bucketName,
        min: b.min,
        max: b.max,
        totalPredictions: b.totalPredictions,
        successfulPredictions: b.successfulPredictions,
        winRatePercent,
        avgConfidence,
        calibrationGap,
        avgOpportunityScore:
          b.totalPredictions > 0 ? Math.round(b.sumOpportunity / b.totalPredictions) : 0,
        avgRiskScore: b.totalPredictions > 0 ? Math.round(b.sumRisk / b.totalPredictions) : 0,
      };
    });

    return {
      totalEvaluated: evaluated.length,
      overallWinRatePercent,
      brierScore,
      buckets: finalBuckets,
    };
  }
}

export const predictionService = new PredictionService();
