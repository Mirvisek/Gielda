import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db/prisma";
import { portfolioService } from "@/lib/portfolio/portfolio-service";
import { marketService } from "@/lib/market/market-service";
import { signalService } from "@/lib/scoring/signal-service";

describe("Testy Bezpieczeństwa IDOR (Cross-User Isolation Guard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(marketService, "getQuote").mockResolvedValue({
      symbol: "TEST",
      price: 150,
      change: 0,
      changePercent: 0,
      currency: "USD",
      timestamp: new Date(),
    } as any);
    vi.spyOn(signalService, "getOrGenerateSignal").mockResolvedValue({
      opportunityScore: 50,
      riskScore: 50,
      confidenceScore: 50,
      direction: "NEUTRAL",
    } as any);
  });

  const userA = "user-alice-123";
  const userB = "user-bob-456";

  const portfolioA = {
    id: "portfolio-alice",
    userId: userA,
    name: "Portfel Alice",
    currency: "USD",
    cashBalance: 5000,
  };

  const portfolioB = {
    id: "portfolio-bob",
    userId: userB,
    name: "Portfel Boba",
    currency: "USD",
    cashBalance: 25000,
  };

  it("nie pozwala Użytkownikowi A usunąć pozycji należącej do Użytkownika B (IDOR Delete Protection)", async () => {
    // Pozycja należy do portfela Boba (userB)
    const positionB = {
      id: "pos-bob-nvda",
      portfolioId: portfolioB.id,
      assetId: "asset-nvda",
      quantity: 50,
      portfolio: portfolioB,
    };

    vi.spyOn(prisma.portfolioPosition, "findUnique").mockResolvedValue(positionB as any);
    const deleteSpy = vi.spyOn(prisma.portfolioPosition, "delete").mockResolvedValue({} as any);

    // Alice (userA) próbuje usunąć pozycję Boba
    await expect(portfolioService.deletePosition(userA, "pos-bob-nvda")).rejects.toThrow(
      "Pozycja nie została odnaleziona lub brak uprawnień dostępu"
    );

    // Baza danych nie powinna wykonać operacji delete
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("zapewnia pełną izolację danych portfela pomiędzy Użytkownikiem A a Użytkownikiem B", async () => {
    // Portfele obu użytkowników
    (vi.spyOn(prisma.portfolio, "findFirst") as any).mockImplementation(({ where }: any) => {
      if (where.userId === userA) return Promise.resolve(portfolioA as any);
      if (where.userId === userB) return Promise.resolve(portfolioB as any);
      return Promise.resolve(null);
    });

    (vi.spyOn(prisma.portfolioPosition, "findMany") as any).mockImplementation(({ where }: any) => {
      if (where.portfolioId === portfolioA.id) {
        return Promise.resolve([
          {
            id: "pos-a-1",
            portfolioId: portfolioA.id,
            assetId: "a1",
            quantity: 10,
            averageBuyPrice: 100,
            realizedPnL: 0,
            status: "ACTIVE",
            asset: { id: "a1", symbol: "AAPL", name: "Apple", currency: "USD" },
          },
        ] as any);
      }
      if (where.portfolioId === portfolioB.id) {
        return Promise.resolve([
          {
            id: "pos-b-1",
            portfolioId: portfolioB.id,
            assetId: "a2",
            quantity: 100,
            averageBuyPrice: 500,
            realizedPnL: 5000,
            status: "ACTIVE",
            asset: { id: "a2", symbol: "NVDA", name: "Nvidia", currency: "USD" },
          },
        ] as any);
      }
      return Promise.resolve([]);
    });

    const summaryA = await portfolioService.getPortfolioSummary(userA);
    const summaryB = await portfolioService.getPortfolioSummary(userB);

    // Alice widzi tylko swój portfel i pozycje
    expect(summaryA.id).toBe(portfolioA.id);
    expect(summaryA.cashBalance).toBe(5000);
    expect(summaryA.positions).toHaveLength(1);
    expect(summaryA.positions[0].symbol).toBe("AAPL");

    // Bob widzi tylko swój portfel i pozycje
    expect(summaryB.id).toBe(portfolioB.id);
    expect(summaryB.cashBalance).toBe(25000);
    expect(summaryB.positions).toHaveLength(1);
    expect(summaryB.positions[0].symbol).toBe("NVDA");
  });

  it("zapewnia izolację historii transakcji i księgi gotówki per użytkownik", async () => {
    (vi.spyOn(prisma.portfolio, "findFirst") as any).mockImplementation(({ where }: any) => {
      if (where.userId === userA) return Promise.resolve(portfolioA as any);
      if (where.userId === userB) return Promise.resolve(portfolioB as any);
      return Promise.resolve(null);
    });

    const findManyTxSpy = vi.spyOn(prisma.portfolioTransaction, "findMany").mockResolvedValue([]);
    vi.spyOn(prisma.portfolioTransaction, "count").mockResolvedValue(0);

    const findManyCashSpy = vi.spyOn(prisma.cashTransaction, "findMany").mockResolvedValue([]);
    vi.spyOn(prisma.cashTransaction, "count").mockResolvedValue(0);

    // Pobranie transakcji przez Alice
    await portfolioService.getTransactions(userA);
    expect(findManyTxSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { portfolioId: portfolioA.id },
      })
    );

    // Pobranie operacji gotówkowych przez Alice
    await portfolioService.getCashTransactions(userA);
    expect(findManyCashSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { portfolioId: portfolioA.id },
      })
    );
  });

  it("zapewnia izolację listy obserwowanych (Watchlist) per użytkownik", async () => {
    const watchlistSpy = vi.spyOn(prisma.watchlist, "findMany").mockResolvedValue([]);

    await portfolioService.getWatchlist(userA);
    expect(watchlistSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: userA },
      })
    );

    const deleteManySpy = vi.spyOn(prisma.watchlist, "deleteMany").mockResolvedValue({ count: 1 });
    vi.spyOn(prisma.asset, "findUnique").mockResolvedValue({ id: "asset-1", symbol: "AAPL" } as any);

    // Alice usuwa z watchlisty
    await portfolioService.removeFromWatchlist(userA, "AAPL");
    expect(deleteManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: userA, assetId: "asset-1" },
      })
    );
  });
});
