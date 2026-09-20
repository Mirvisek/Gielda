import { describe, it, expect, vi } from "vitest";
import prisma from "@/lib/db/prisma";
import { predictionService } from "@/lib/scoring/prediction-service";

describe("Prediction Journal & Calibration Engine", () => {
  it("should calculate Brier score and confidence calibration buckets accurately", async () => {
    // Mock prisma findMany for evaluated predictions
    const mockEvaluatedPredictions = [
      {
        id: "p1",
        confidence: 80,
        opportunityScore: 75,
        riskScore: 30,
        result: { isSuccess: true },
      },
      {
        id: "p2",
        confidence: 80,
        opportunityScore: 70,
        riskScore: 35,
        result: { isSuccess: true },
      },
      {
        id: "p3",
        confidence: 80,
        opportunityScore: 68,
        riskScore: 40,
        result: { isSuccess: false }, // 1 failure out of 3 in 80% bucket
      },
      {
        id: "p4",
        confidence: 60,
        opportunityScore: 60,
        riskScore: 50,
        result: { isSuccess: true },
      },
      {
        id: "p5",
        confidence: 60,
        opportunityScore: 55,
        riskScore: 55,
        result: { isSuccess: false }, // 1 success, 1 failure in 60% bucket -> 50% win rate
      },
    ];

    vi.spyOn(prisma.prediction, "findMany").mockResolvedValueOnce(
      mockEvaluatedPredictions as any
    );

    const stats = await predictionService.getCalibrationStats();

    expect(stats.totalEvaluated).toBe(5);
    expect(stats.overallWinRatePercent).toBe(60.0); // 3 successes / 5 = 60%

    // Brier Score calculation:
    // p1: (0.8 - 1)^2 = 0.04
    // p2: (0.8 - 1)^2 = 0.04
    // p3: (0.8 - 0)^2 = 0.64
    // p4: (0.6 - 1)^2 = 0.16
    // p5: (0.6 - 0)^2 = 0.36
    // sum = 0.04 + 0.04 + 0.64 + 0.16 + 0.36 = 1.24 / 5 = 0.248
    expect(stats.brierScore).toBeCloseTo(0.248, 3);

    // Buckets check
    expect(stats.buckets).toHaveLength(3);
    const bucket60 = stats.buckets.find((b) => b.bucketName.includes("50-65%"));
    const bucket80 = stats.buckets.find((b) => b.bucketName.includes("80-100%"));

    expect(bucket60?.totalPredictions).toBe(2);
    expect(bucket60?.winRatePercent).toBe(50.0);

    expect(bucket80?.totalPredictions).toBe(3);
    expect(bucket80?.winRatePercent).toBe(66.7);
  });

  it("should return zeros for calibration stats when no predictions have matured", async () => {
    vi.spyOn(prisma.prediction, "findMany").mockResolvedValueOnce([]);

    const stats = await predictionService.getCalibrationStats();

    expect(stats.totalEvaluated).toBe(0);
    expect(stats.overallWinRatePercent).toBe(0);
    expect(stats.brierScore).toBe(0);
    expect(stats.buckets).toEqual([]);
  });
});
