import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db/prisma";
import { portfolioService } from "@/lib/portfolio/portfolio-service";
import { marketService } from "@/lib/market/market-service";
import { signalService } from "@/lib/scoring/signal-service";

describe("Moduł Portfela Inwestycyjnego (Portfolio Service)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Kalkulacje Finansowe i Matematyka Transakcji", () => {
    it("powinien poprawnie wyliczyć średnią ważoną cenę zakupu (BUY) przy kolejnych transakcjach", async () => {
      const mockPortfolio = {
        id: "port-1",
        userId: "user-1",
        name: "Główny Portfel",
        currency: "USD",
        cashBalance: 10000,
      };

      const mockAsset = {
        id: "asset-aapl",
        symbol: "AAPL",
        name: "Apple Inc.",
        currency: "USD",
        isActive: true,
      };

      vi.spyOn(prisma.portfolio, "findFirst").mockResolvedValue(mockPortfolio as any);
      vi.spyOn(marketService, "getOrCreateAsset").mockResolvedValue(mockAsset as any);

      // Transakcja 1: Zakup 10 akcji po $180
      let positionState: any = null;
      let transactionRecorded: any = null;
      let cashBalanceState = 10000;

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
        const tx = {
          portfolioPosition: {
            findUnique: vi.fn().mockImplementation(() => Promise.resolve(positionState)),
            upsert: vi.fn().mockImplementation(({ create, update }: any) => {
              if (!positionState) {
                positionState = { ...create, id: "pos-1" };
              } else {
                positionState = { ...positionState, ...update };
              }
              return Promise.resolve(positionState);
            }),
            update: vi.fn().mockImplementation(({ data }: any) => {
              positionState = { ...positionState, ...data };
              return Promise.resolve(positionState);
            }),
          },
          portfolioTransaction: {
            create: vi.fn().mockImplementation(({ data }: any) => {
              transactionRecorded = { id: "tx-1", ...data };
              return Promise.resolve(transactionRecorded);
            }),
          },
          portfolio: {
            findUniqueOrThrow: vi.fn().mockImplementation(() =>
              Promise.resolve({ ...mockPortfolio, cashBalance: cashBalanceState })
            ),
            update: vi.fn().mockImplementation(({ data }: any) => {
              cashBalanceState = data.cashBalance;
              return Promise.resolve({ ...mockPortfolio, cashBalance: cashBalanceState });
            }),
          },
          cashTransaction: {
            create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "ctx-1", ...data })),
          },
        };
        return await callback(tx);
      });

      // Wykonaj zakup 10 @ 180
      await portfolioService.executeTrade("user-1", {
        symbol: "AAPL",
        type: "BUY",
        quantity: 10,
        price: 180,
        fee: 5,
      });

      expect(positionState.quantity).toBe(10);
      expect(positionState.averageBuyPrice).toBe(180);
      expect(cashBalanceState).toBe(10000 - (10 * 180 + 5)); // 8195

      // Transakcja 2: Zakup kolejnych 10 akcji po $200
      await portfolioService.executeTrade("user-1", {
        symbol: "AAPL",
        type: "BUY",
        quantity: 10,
        price: 200,
        fee: 0,
      });

      // Oczekiwana średnia cena: (10 * 180 + 10 * 200) / 20 = 3800 / 20 = 190.00
      expect(positionState.quantity).toBe(20);
      expect(positionState.averageBuyPrice).toBe(190);
      expect(cashBalanceState).toBe(8195 - (10 * 200)); // 6195
    });

    it("powinien prawidłowo obliczyć Realized P&L przy sprzedaży (SELL) i NIE zmieniać averageBuyPrice", async () => {
      const mockPortfolio = {
        id: "port-1",
        userId: "user-1",
        currency: "USD",
        cashBalance: 5000,
      };
      const mockAsset = {
        id: "asset-aapl",
        symbol: "AAPL",
        currency: "USD",
      };

      vi.spyOn(prisma.portfolio, "findFirst").mockResolvedValue(mockPortfolio as any);
      vi.spyOn(marketService, "getOrCreateAsset").mockResolvedValue(mockAsset as any);

      // Stan początkowy: 20 akcji ze średnią ceną 190, realizedPnL = 0
      let positionState: any = {
        id: "pos-1",
        portfolioId: "port-1",
        assetId: "asset-aapl",
        quantity: 20,
        averageBuyPrice: 190,
        realizedPnL: 0,
        status: "ACTIVE",
      };

      let recordedTx: any = null;
      let recordedCashTx: any = null;
      let cashBalanceState = 5000;

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
        const tx = {
          portfolioPosition: {
            findUnique: vi.fn().mockResolvedValue(positionState),
            update: vi.fn().mockImplementation(({ data }: any) => {
              positionState = { ...positionState, ...data };
              return Promise.resolve(positionState);
            }),
          },
          portfolioTransaction: {
            create: vi.fn().mockImplementation(({ data }: any) => {
              recordedTx = data;
              return Promise.resolve({ id: "tx-sell", ...data });
            }),
          },
          portfolio: {
            findUniqueOrThrow: vi.fn().mockResolvedValue({ ...mockPortfolio, cashBalance: cashBalanceState }),
            update: vi.fn().mockImplementation(({ data }: any) => {
              cashBalanceState = data.cashBalance;
              return Promise.resolve({ ...mockPortfolio, cashBalance: cashBalanceState });
            }),
          },
          cashTransaction: {
            create: vi.fn().mockImplementation(({ data }: any) => {
              recordedCashTx = data;
              return Promise.resolve({ id: "ctx-sell", ...data });
            }),
          },
        };
        return await callback(tx);
      });

      // Sprzedaż 5 akcji po $220 z prowizją $10
      // tradeRealizedPnL = 5 * (220 - 190) = 5 * 30 = +150 USD
      await portfolioService.executeTrade("user-1", {
        symbol: "AAPL",
        type: "SELL",
        quantity: 5,
        price: 220,
        fee: 10,
      });

      // Rygor architektoniczny:
      // 1. Pozostała ilość to 15
      expect(positionState.quantity).toBe(15);
      // 2. averageBuyPrice NIE ULEGA ZMIANIE przy sprzedaży! Nadal $190
      expect(positionState.averageBuyPrice).toBe(190);
      // 3. realizedPnL powiększa się o dokładnie $150
      expect(positionState.realizedPnL).toBe(150);
      // 4. Status pozycji pozostaje ACTIVE
      expect(positionState.status).toBe("ACTIVE");

      // 5. Wpływ gotówki: (5 * 220) - 10 = 1100 - 10 = 1090
      expect(cashBalanceState).toBe(5000 + 1090); // 6090
      expect(recordedCashTx.balanceAfter).toBe(6090);
      expect(recordedCashTx.amount).toBe(1090);
    });

    it("powinien oznaczyć pozycję jako CLOSED przy sprzedaży wszystkich posiadanych akcji (do 0)", async () => {
      const mockPortfolio = {
        id: "port-1",
        userId: "user-1",
        currency: "USD",
        cashBalance: 1000,
      };
      const mockAsset = {
        id: "asset-msft",
        symbol: "MSFT",
        currency: "USD",
      };

      vi.spyOn(prisma.portfolio, "findFirst").mockResolvedValue(mockPortfolio as any);
      vi.spyOn(marketService, "getOrCreateAsset").mockResolvedValue(mockAsset as any);

      let positionState: any = {
        id: "pos-msft",
        portfolioId: "port-1",
        assetId: "asset-msft",
        quantity: 10,
        averageBuyPrice: 300,
        realizedPnL: 50,
        status: "ACTIVE",
      };

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
        const tx = {
          portfolioPosition: {
            findUnique: vi.fn().mockResolvedValue(positionState),
            update: vi.fn().mockImplementation(({ data }: any) => {
              positionState = { ...positionState, ...data };
              return Promise.resolve(positionState);
            }),
          },
          portfolioTransaction: {
            create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "tx-all", ...data })),
          },
          portfolio: {
            findUniqueOrThrow: vi.fn().mockResolvedValue(mockPortfolio),
            update: vi.fn().mockResolvedValue(mockPortfolio),
          },
          cashTransaction: {
            create: vi.fn().mockResolvedValue({ id: "ctx-1" }),
          },
        };
        return await callback(tx);
      });

      // Sprzedaż wszystkich 10 akcji po $350
      // Realized PnL z tej transakcji = 10 * (350 - 300) = +500
      // Łączny realizedPnL pozycji = 50 + 500 = 550
      await portfolioService.executeTrade("user-1", {
        symbol: "MSFT",
        type: "SELL",
        quantity: 10,
        price: 350,
      });

      expect(positionState.quantity).toBe(0);
      expect(positionState.status).toBe("CLOSED");
      expect(positionState.averageBuyPrice).toBe(300); // zachowana historia
      expect(positionState.realizedPnL).toBe(550);
      expect(positionState.closedAt).toBeInstanceOf(Date);
    });

    it("powinien zablokować próbę sprzedaży większej liczby akcji niż posiadana (ochrona przed krótką sprzedażą)", async () => {
      const mockPortfolio = { id: "port-1", userId: "user-1", currency: "USD" };
      const mockAsset = { id: "asset-1", symbol: "TSLA", currency: "USD" };

      vi.spyOn(prisma.portfolio, "findFirst").mockResolvedValue(mockPortfolio as any);
      vi.spyOn(marketService, "getOrCreateAsset").mockResolvedValue(mockAsset as any);

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
        const tx = {
          portfolioPosition: {
            findUnique: vi.fn().mockResolvedValue({
              quantity: 5,
              status: "ACTIVE",
              averageBuyPrice: 200,
            }),
          },
        };
        return await callback(tx);
      });

      // Próba sprzedaży 10 gdy mamy tylko 5
      await expect(
        portfolioService.executeTrade("user-1", {
          symbol: "TSLA",
          type: "SELL",
          quantity: 10,
          price: 250,
        })
      ).rejects.toThrow("Niewystarczająca liczba akcji do sprzedaży");
    });

    it("powinien odrzucić transakcję aktywem o niezgodnej walucie z portfelem (Currency Guard)", async () => {
      const mockPortfolio = { id: "port-1", userId: "user-1", currency: "USD" };
      const mockAsset = { id: "asset-cdr", symbol: "CDR.WA", currency: "PLN" }; // Waluta PLN vs USD portfela

      vi.spyOn(prisma.portfolio, "findFirst").mockResolvedValue(mockPortfolio as any);
      vi.spyOn(marketService, "getOrCreateAsset").mockResolvedValue(mockAsset as any);

      await expect(
        portfolioService.executeTrade("user-1", {
          symbol: "CDR.WA",
          type: "BUY",
          quantity: 10,
          price: 150,
        })
      ).rejects.toThrow("Waluta instrumentu (PLN) różni się od waluty portfela (USD)");
    });
  });

  describe("Portfolio Risk Score & Gotówka jako Bufor", () => {
    it("powinien uwzględnić wagę gotówki równą 0, matematycznie redukując całkowite ryzyko portfela", async () => {
      const mockPortfolio = {
        id: "port-1",
        userId: "user-1",
        currency: "USD",
        cashBalance: 5000, // $5,000 w gotówce (waga ryzyka = 0)
      };

      const mockPositions = [
        {
          id: "pos-1",
          portfolioId: "port-1",
          assetId: "a1",
          quantity: 50,
          averageBuyPrice: 100, // costBasis = 5000
          realizedPnL: 0,
          status: "ACTIVE",
          asset: { id: "a1", symbol: "AAPL", name: "Apple", currency: "USD" },
        },
      ];

      vi.spyOn(prisma.portfolio, "findFirst").mockResolvedValue(mockPortfolio as any);
      vi.spyOn(prisma.portfolioPosition, "findMany").mockResolvedValue(mockPositions as any);

      // Notowanie: 100 (marketValue = 50 * 100 = $5,000)
      vi.spyOn(marketService, "getQuote").mockResolvedValue({
        symbol: "AAPL",
        price: 100,
        change: 0,
        changePercent: 0,
        currency: "USD",
        timestamp: new Date(),
      });

      // Sygnał AI: Risk Score = 60
      vi.spyOn(signalService, "getOrGenerateSignal").mockResolvedValue({
        symbol: "AAPL",
        opportunityScore: 70,
        riskScore: 60,
        confidenceScore: 80,
        direction: "POSITIVE",
        timestamp: new Date(),
        factors: [],
      } as any);

      const summary = await portfolioService.getPortfolioSummary("user-1");

      // TotalValue = EquityValue ($5,000) + CashBalance ($5,000) = $10,000
      expect(summary.totalValue).toBe(10000);
      expect(summary.equityValue).toBe(5000);
      expect(summary.cashBalance).toBe(5000);

      // Portfolio Risk Score:
      // (5,000 / 10,000) * 60 + (5,000 / 10,000) * 0 = 0.5 * 60 + 0 = 30.0!
      // Bufor gotówki precyzyjnie obniżył ryzyko z 60 do 30!
      expect(summary.portfolioRiskScore).toBe(30.0);
      expect(summary.isHighRiskWarning).toBe(false);
    });

    it("powinien wyzwolić ostrzeżenie o koncentracji ryzyka przy pozycji >15% o Risk Score >= 70", async () => {
      const mockPortfolio = {
        id: "port-1",
        userId: "user-1",
        currency: "USD",
        cashBalance: 1000,
      };

      const mockPositions = [
        {
          id: "pos-high-risk",
          portfolioId: "port-1",
          assetId: "a2",
          quantity: 100,
          averageBuyPrice: 90,
          realizedPnL: 0,
          status: "ACTIVE",
          asset: { id: "a2", symbol: "MEME", name: "High Risk Meme", currency: "USD" },
        },
      ];

      vi.spyOn(prisma.portfolio, "findFirst").mockResolvedValue(mockPortfolio as any);
      vi.spyOn(prisma.portfolioPosition, "findMany").mockResolvedValue(mockPositions as any);

      // Kurs 100 -> marketValue = $10,000 (stanowi 10000 / 11000 = ~90.9% portfela > 15%)
      vi.spyOn(marketService, "getQuote").mockResolvedValue({
        symbol: "MEME",
        price: 100,
        change: 0,
        changePercent: 0,
        currency: "USD",
        timestamp: new Date(),
      });

      // Ryzyko aktywa = 85 (>= 70)
      vi.spyOn(signalService, "getOrGenerateSignal").mockResolvedValue({
        symbol: "MEME",
        opportunityScore: 40,
        riskScore: 85,
        confidenceScore: 70,
        direction: "NEGATIVE",
        timestamp: new Date(),
        factors: [],
      } as any);

      const summary = await portfolioService.getPortfolioSummary("user-1");

      const pos = summary.positions[0];
      expect(pos.isConcentratedRiskWarning).toBe(true);
      expect(summary.isHighRiskWarning).toBe(true);
    });
  });

  describe("Księga Gotówki (Cash Ledger)", () => {
    it("powinien poprawnie wykonać operacje DEPOSIT, WITHDRAWAL i rejestrować balanceAfter po stronie serwera", async () => {
      const mockPortfolio = {
        id: "port-1",
        userId: "user-1",
        currency: "USD",
        cashBalance: 2000,
      };

      vi.spyOn(prisma.portfolio, "findFirst").mockResolvedValue(mockPortfolio as any);

      let cashState = 2000;
      let recordedTx: any = null;

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
        const tx = {
          portfolio: {
            findUniqueOrThrow: vi.fn().mockImplementation(() =>
              Promise.resolve({ ...mockPortfolio, cashBalance: cashState })
            ),
            update: vi.fn().mockImplementation(({ data }: any) => {
              cashState = data.cashBalance;
              return Promise.resolve({ ...mockPortfolio, cashBalance: cashState });
            }),
          },
          cashTransaction: {
            create: vi.fn().mockImplementation(({ data }: any) => {
              recordedTx = data;
              return Promise.resolve({ id: "ctx-1", ...data });
            }),
          },
        };
        return await callback(tx);
      });

      // 1. Wpłata 3000 USD
      await portfolioService.executeCashOperation("user-1", {
        type: "DEPOSIT",
        amount: 3000,
        description: "Zasilenie konta",
      });

      expect(cashState).toBe(5000);
      expect(recordedTx.balanceAfter).toBe(5000);
      expect(recordedTx.type).toBe("DEPOSIT");

      // 2. Wypłata 1500 USD
      await portfolioService.executeCashOperation("user-1", {
        type: "WITHDRAWAL",
        amount: 1500,
        description: "Wypłata na rachunek",
      });

      expect(cashState).toBe(3500);
      expect(recordedTx.balanceAfter).toBe(3500);

      // 3. Wypłata przekraczająca saldo -> błąd
      await expect(
        portfolioService.executeCashOperation("user-1", {
          type: "WITHDRAWAL",
          amount: 10000,
        })
      ).rejects.toThrow("Niewystarczające saldo gotówki");
    });
  });
});
