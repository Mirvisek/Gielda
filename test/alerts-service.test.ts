import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db/prisma";
import { alertService } from "@/lib/alerts/alert-service";
import { marketService } from "@/lib/market/market-service";
import { signalService } from "@/lib/scoring/signal-service";
import { portfolioService } from "@/lib/portfolio/portfolio-service";
import { pushService } from "@/lib/alerts/push-service";

describe("Moduł Alertów Rynkowych i Portfelowych (Alert Service)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(pushService, "sendNotificationToUser").mockResolvedValue({
      sentCount: 1,
      failedCount: 0,
      purgedCount: 0,
    });
  });

  it("powinien utworzyć regułę alertu z powiązaniem do aktywa", async () => {
    const mockAsset = {
      id: "asset-aapl",
      symbol: "AAPL",
      name: "Apple Inc.",
      currency: "USD",
    };

    vi.spyOn(marketService, "getOrCreateAsset").mockResolvedValue(mockAsset as any);
    vi.spyOn(prisma.alert, "create").mockResolvedValue({
      id: "alert-1",
      userId: "user-1",
      assetId: "asset-aapl",
      alertType: "PRICE",
      conditionOperator: ">",
      thresholdValue: 200 as any,
      isActive: true,
      notes: "Kupno po wybiciu",
      cooldownMinutes: 60,
      lastNotifiedAt: null,
      isTriggered: false,
      triggeredAt: null,
      createdAt: new Date(),
      asset: mockAsset,
    } as any);

    const alert = await alertService.createAlert("user-1", {
      assetSymbol: "AAPL",
      alertType: "PRICE",
      conditionOperator: ">",
      thresholdValue: 200,
      cooldownMinutes: 60,
      notes: "Kupno po wybiciu",
    });

    expect(alert.id).toBe("alert-1");
    expect(alert.assetSymbol).toBe("AAPL");
    expect(alert.thresholdValue).toBe(200);
    expect(alert.conditionOperator).toBe(">");
    expect(alert.cooldownMinutes).toBe(60);
  });

  it("powinien wyzwolić alert cenowy i powiadomienie, gdy kurs przekroczy próg", async () => {
    const mockAlert = {
      id: "alert-price-1",
      userId: "user-1",
      assetId: "asset-nvda",
      alertType: "PRICE",
      conditionOperator: ">",
      thresholdValue: 120 as any,
      isActive: true,
      cooldownMinutes: 60,
      lastNotifiedAt: null,
      asset: {
        id: "asset-nvda",
        symbol: "NVDA",
        name: "Nvidia Corp",
        currency: "USD",
      },
    };

    (vi.spyOn(prisma.alert, "findMany") as any).mockResolvedValue([mockAlert]);
    vi.spyOn(marketService, "getQuote").mockResolvedValue({
      symbol: "NVDA",
      price: 135.5, // 135.5 > 120 -> wyzwala alert!
      change: 5,
      changePercent: 3.8,
      currency: "USD",
      timestamp: new Date(),
    } as any);

    const notifCreateSpy = vi.spyOn(prisma.alertNotification, "create").mockResolvedValue({ id: "notif-1" } as any);
    const alertUpdateSpy = vi.spyOn(prisma.alert, "update").mockResolvedValue({} as any);
    const pushSpy = vi.spyOn(pushService, "sendNotificationToUser");

    const result = await alertService.evaluateAlerts();

    expect(result.evaluatedCount).toBe(1);
    expect(result.triggeredCount).toBe(1);

    // Zapis powiadomienia w bazie danych
    expect(notifCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          alertId: "alert-price-1",
          title: "Alert Cenowy: NVDA",
          linkUrl: "/assets/NVDA",
        }),
      })
    );

    // Aktualizacja stanu alertu
    expect(alertUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "alert-price-1" },
        data: expect.objectContaining({
          isTriggered: true,
        }),
      })
    );

    // Wysłanie notyfikacji Web Push
    expect(pushSpy).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "Alert Cenowy: NVDA",
        url: "/assets/NVDA",
      })
    );
  });

  it("powinien zablokować wyzwolenie alertu w oknie cooldownu (ochrona przed floodingiem)", async () => {
    const recentDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minut temu (cooldown to 60 min)
    const mockAlert = {
      id: "alert-cooldown",
      userId: "user-1",
      assetId: "asset-nvda",
      alertType: "PRICE",
      conditionOperator: ">",
      thresholdValue: 100 as any,
      isActive: true,
      cooldownMinutes: 60,
      lastNotifiedAt: recentDate, // Ostatnio powiadomiono 10 min temu
      asset: { symbol: "NVDA" },
    };

    (vi.spyOn(prisma.alert, "findMany") as any).mockResolvedValue([mockAlert]);
    const quoteSpy = vi.spyOn(marketService, "getQuote");
    const notifCreateSpy = vi.spyOn(prisma.alertNotification, "create");

    const result = await alertService.evaluateAlerts();

    expect(result.triggeredCount).toBe(0);
    // Kurs nawet nie powinien być sprawdzany z powodu aktywnego cooldownu
    expect(quoteSpy).not.toHaveBeenCalled();
    expect(notifCreateSpy).not.toHaveBeenCalled();
  });

  it("powinien wyzwolić alert przy wysokim wskaźniku szansy AI (Opportunity Score)", async () => {
    const mockAlert = {
      id: "alert-opp",
      userId: "user-1",
      assetId: "asset-msft",
      alertType: "OPPORTUNITY",
      conditionOperator: ">=",
      thresholdValue: 80 as any,
      isActive: true,
      cooldownMinutes: 60,
      lastNotifiedAt: null,
      asset: {
        id: "asset-msft",
        symbol: "MSFT",
        name: "Microsoft Corp",
      },
    };

    (vi.spyOn(prisma.alert, "findMany") as any).mockResolvedValue([mockAlert]);
    vi.spyOn(signalService, "getOrGenerateSignal").mockResolvedValue({
      opportunityScore: 85, // 85 >= 80 -> wyzwala
      riskScore: 30,
      confidenceScore: 90,
      direction: "POSITIVE",
    } as any);

    const notifCreateSpy = vi.spyOn(prisma.alertNotification, "create").mockResolvedValue({ id: "notif-opp" } as any);

    const result = await alertService.evaluateAlerts();

    expect(result.triggeredCount).toBe(1);
    expect(notifCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Wskaźnik Szansy AI: MSFT",
          severity: "SUCCESS",
        }),
      })
    );
  });

  it("powinien wyzwolić alert portfelowy przy podwyższonym wskaźniku ryzyka portfela", async () => {
    const mockAlert = {
      id: "alert-port",
      userId: "user-1",
      assetId: null,
      alertType: "PORTFOLIO",
      conditionOperator: ">=",
      thresholdValue: 65 as any,
      isActive: true,
      cooldownMinutes: 60,
      lastNotifiedAt: null,
    };

    (vi.spyOn(prisma.alert, "findMany") as any).mockResolvedValue([mockAlert]);
    vi.spyOn(portfolioService, "getPortfolioSummary").mockResolvedValue({
      id: "p1",
      portfolioRiskScore: 72, // 72 >= 65 -> wyzwala alert portfelowy
      totalValue: 50000,
      isHighRiskWarning: true,
    } as any);

    const notifCreateSpy = vi.spyOn(prisma.alertNotification, "create").mockResolvedValue({ id: "notif-port" } as any);

    const result = await alertService.evaluateAlerts();

    expect(result.triggeredCount).toBe(1);
    expect(notifCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: "Ostrzeżenie Ryzyka Portfela",
          linkUrl: "/portfolio",
        }),
      })
    );
  });
});
