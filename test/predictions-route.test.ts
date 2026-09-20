import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserRole, UserStatus } from "@prisma/client";
import { NextRequest } from "next/server";

// Mock session
const mockGetCurrentSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: () => mockGetCurrentSession(),
}));

// Mock request context
vi.mock("@/lib/security/request-context", () => ({
  getRequestContext: vi.fn().mockResolvedValue({ ip: "127.0.0.1", userAgent: "test-agent" }),
}));

// Mock rate-limit
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 20, resetInSeconds: 60 }),
}));

// Mock prediction service
const mockGetPredictions = vi.fn();
const mockGetCalibrationStats = vi.fn();
const mockEvaluateMaturedPredictions = vi.fn();

vi.mock("@/lib/scoring/prediction-service", () => ({
  predictionService: {
    getPredictions: (...args: any[]) => mockGetPredictions(...args),
    getCalibrationStats: (...args: any[]) => mockGetCalibrationStats(...args),
    evaluateMaturedPredictions: (...args: any[]) => mockEvaluateMaturedPredictions(...args),
  },
}));

import { GET, POST } from "@/app/api/predictions/route";
import { serializePrediction } from "@/app/predictions/prediction-client";

describe("Predictions API Route & UI Serialization (/api/predictions)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/predictions (Server-Side Auth & Filtering)", () => {
    it("should reject unauthenticated request with 401", async () => {
      mockGetCurrentSession.mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/predictions");
      const res = await GET(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("UNAUTHORIZED");
    });

    it("should allow authenticated USER to fetch predictions with stats", async () => {
      mockGetCurrentSession.mockResolvedValue({
        session: { id: "s1" },
        user: {
          id: "u1",
          email: "user@example.com",
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
        },
      });

      mockGetPredictions.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      mockGetCalibrationStats.mockResolvedValue({
        totalEvaluated: 12,
        overallWinRatePercent: 75.0,
        brierScore: 0.185,
        buckets: [],
      });

      const req = new NextRequest("http://localhost:3000/api/predictions?symbol=AAPL&direction=POSITIVE&resolution=SUCCESS&stats=true");
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(mockGetPredictions).toHaveBeenCalledWith({
        symbol: "AAPL",
        direction: "POSITIVE",
        status: undefined,
        resolution: "SUCCESS",
        page: 1,
        limit: 20,
      });

      expect(mockGetCalibrationStats).toHaveBeenCalledTimes(1);
      expect(data.calibrationStats).toBeDefined();
      expect(data.calibrationStats.brierScore).toBe(0.185);
    });
  });

  describe("POST /api/predictions (Server-Side Admin-Only Protection)", () => {
    it("should reject unauthenticated request", async () => {
      mockGetCurrentSession.mockResolvedValue(null);

      const res = await POST();
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBeTruthy();
      expect(mockEvaluateMaturedPredictions).not.toHaveBeenCalled();
    });

    it("should reject regular USER role with 403", async () => {
      mockGetCurrentSession.mockResolvedValue({
        session: { id: "s1" },
        user: {
          id: "u1",
          email: "user@example.com",
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
        },
      });

      const res = await POST();
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Wymagane uprawnienia administratora");
      expect(mockEvaluateMaturedPredictions).not.toHaveBeenCalled();
    });

    it("should allow ADMIN to trigger evaluation of matured predictions", async () => {
      mockGetCurrentSession.mockResolvedValue({
        session: { id: "s1" },
        user: {
          id: "admin-1",
          email: "admin@example.com",
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        },
      });

      mockEvaluateMaturedPredictions.mockResolvedValue({ evaluatedCount: 5 });

      const res = await POST();
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.result.evaluatedCount).toBe(5);
      expect(mockEvaluateMaturedPredictions).toHaveBeenCalledTimes(1);
    });
  });

  describe("serializePrediction Helper", () => {
    it("should safely convert Prisma Decimal and parse JSON strings", () => {
      const rawPred = {
        id: "pred-1",
        assetId: "a1",
        signalId: "sig-1",
        timestamp: new Date("2026-06-01T10:00:00Z"),
        horizonDays: 30,
        entryPrice: "185.5000",
        predictedDirection: "POSITIVE",
        opportunityScore: 78,
        riskScore: 32,
        confidence: 85,
        status: "ACTIVE",
        thesis: "Scenariusz wzrostowy",
        catalysts: JSON.stringify(["Wybicie oporu $190", "Dobre wyniki kwartalne"]),
        invalidators: JSON.stringify(["Spadek poniżej $175"]),
        isImmutable: true,
        asset: { symbol: "AAPL", name: "Apple Inc." },
        result: {
          id: "res-1",
          predictionId: "pred-1",
          priceAfter1d: "187.2000",
          priceAfter7d: "192.5000",
          priceAfter30d: null,
          priceAfter90d: null,
          actualReturn1d: "0.9164",
          actualReturn7d: "3.7735",
          actualReturn30d: null,
          actualReturn90d: null,
          evaluatedAt: new Date("2026-06-08T10:00:00Z"),
          isSuccess: true,
        },
      };

      const serialized = serializePrediction(rawPred);

      expect(serialized.entryPrice).toBe(185.5);
      expect(Array.isArray(serialized.catalysts)).toBe(true);
      expect(serialized.catalysts).toHaveLength(2);
      expect(serialized.invalidators).toEqual(["Spadek poniżej $175"]);
      expect(serialized.result?.priceAfter1d).toBe(187.2);
      expect(serialized.result?.actualReturn7d).toBe(3.7735);
      expect(serialized.result?.isSuccess).toBe(true);
    });

    it("should handle null results and corrupted JSON gracefully", () => {
      const rawPred = {
        id: "pred-2",
        assetId: "a2",
        signalId: null,
        timestamp: "2026-06-01T10:00:00Z",
        horizonDays: 30,
        entryPrice: 50.0,
        predictedDirection: "NEUTRAL",
        opportunityScore: null,
        riskScore: null,
        confidence: 50,
        status: "NO_CLEAR_SIGNAL",
        thesis: null,
        catalysts: "invalid json string",
        invalidators: null,
        isImmutable: true,
        asset: { symbol: "MSFT", name: "Microsoft Corp." },
        result: null,
      };

      const serialized = serializePrediction(rawPred);

      expect(serialized.catalysts).toBeNull();
      expect(serialized.invalidators).toBeNull();
      expect(serialized.result).toBeNull();
    });
  });
});
