import prisma from "@/lib/db/prisma";
import { marketService } from "@/lib/market/market-service";
import { signalService } from "@/lib/scoring/signal-service";
import { PORTFOLIO_CONCENTRATION_THRESHOLD, PORTFOLIO_HIGH_RISK_THRESHOLD } from "./config";
import {
  ExecuteTradeInput,
  ExecuteTradeSchema,
  CashOperationInput,
  CashOperationSchema,
  PortfolioSummary,
  PositionSummary,
  WatchlistItemSummary,
  PortfolioTransactionDto,
  CashTransactionDto,
} from "./types";

export class PortfolioService {
  /**
   * Pobiera lub bezpiecznie tworzy domyślny portfel użytkownika (USD).
   */
  async getOrCreateDefaultPortfolio(userId: string) {
    let portfolio = await prisma.portfolio.findFirst({
      where: { userId },
    });

    if (!portfolio) {
      portfolio = await prisma.portfolio.create({
        data: {
          userId,
          name: "Główny Portfel",
          currency: "USD",
          cashBalance: 0,
        },
      });
    }

    return portfolio;
  }

  /**
   * Pobiera pełne podsumowanie portfela:
   * - Pozycje aktywne z aktualnymi kursami rynkowymi i sygnałami AI
   * - Niezrealizowany i zrealizowany P&L
   * - Ważony Portfolio Risk Score (z zerową wagą ryzyka gotówki)
   * - Flagi ostrzegawcze przed nadmierną koncentracją i wysokim ryzykiem
   */
  async getPortfolioSummary(userId: string): Promise<PortfolioSummary> {
    const portfolio = await this.getOrCreateDefaultPortfolio(userId);

    // 1. Pobierz wszystkie pozycje (zarówno aktywne, jak i zamknięte dla zrealizowanego PnL)
    const allPositions = await prisma.portfolioPosition.findMany({
      where: { portfolioId: portfolio.id },
      include: { asset: true },
    });

    const activePositions = allPositions.filter(
      (p) => p.status === "ACTIVE" && Number(p.quantity) > 0
    );

    // 2. Równolegle pobierz notowania i sygnały dla aktywnych pozycji
    const quotesAndSignals = await Promise.all(
      activePositions.map(async (pos) => {
        const symbol = pos.asset.symbol;
        const [quoteRes, signalRes] = await Promise.allSettled([
          marketService.getQuote(symbol),
          signalService.getOrGenerateSignal(symbol),
        ]);

        const currentPrice =
          quoteRes.status === "fulfilled" && quoteRes.value.price > 0
            ? quoteRes.value.price
            : Number(pos.averageBuyPrice);

        const signal =
          signalRes.status === "fulfilled"
            ? {
                opportunityScore: signalRes.value.opportunityScore,
                riskScore: signalRes.value.riskScore,
                confidenceScore: signalRes.value.confidenceScore,
                direction: signalRes.value.direction,
              }
            : null;

        return { currentPrice, signal };
      })
    );

    // 3. Oblicz skumulowany zrealizowany PnL (ze wszystkich pozycji, w tym zamkniętych)
    const totalRealizedPnL = allPositions.reduce(
      (sum, p) => sum + Number(p.realizedPnL),
      0
    );

    // 4. Oblicz wartości dla aktywnych pozycji
    let equityValue = 0;
    let totalCostBasis = 0;
    let totalUnrealizedPnL = 0;

    interface IntermediatePos {
      pos: (typeof activePositions)[0];
      currentPrice: number;
      signal: {
        opportunityScore: number;
        riskScore: number;
        confidenceScore: number;
        direction: string;
      } | null;
      quantity: number;
      avgPrice: number;
      costBasis: number;
      marketValue: number;
      unrealizedPnL: number;
      unrealizedPnLPercent: number;
      realizedPnL: number;
    }

    const intermediatePositions: IntermediatePos[] = activePositions.map((pos, idx) => {
      const { currentPrice, signal } = quotesAndSignals[idx];
      const quantity = Number(pos.quantity);
      const avgPrice = Number(pos.averageBuyPrice);
      const costBasis = quantity * avgPrice;
      const marketValue = quantity * currentPrice;
      const unrealizedPnL = marketValue - costBasis;
      const unrealizedPnLPercent = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;
      const realizedPnL = Number(pos.realizedPnL);

      equityValue += marketValue;
      totalCostBasis += costBasis;
      totalUnrealizedPnL += unrealizedPnL;

      return {
        pos,
        currentPrice,
        signal,
        quantity,
        avgPrice,
        costBasis,
        marketValue,
        unrealizedPnL,
        unrealizedPnLPercent,
        realizedPnL,
      };
    });

    const cashBalance = Number(portfolio.cashBalance);
    const totalValue = equityValue + cashBalance;

    // 5. Oblicz wagi, wskaźniki ryzyka i ostrzeżenia
    let weightedRiskSum = 0;
    const positionSummaries: PositionSummary[] = intermediatePositions.map((item) => {
      const weightPercent = totalValue > 0 ? (item.marketValue / totalValue) * 100 : 0;
      const riskScore = item.signal?.riskScore ?? 50;

      // Gotówka ma wskaźnik ryzyka 0:
      // PortfolioRisk = sum((marketValue_i / totalValue) * risk_i)
      if (totalValue > 0) {
        weightedRiskSum += (item.marketValue / totalValue) * riskScore;
      }

      const isConcentratedRiskWarning =
        weightPercent / 100 >= PORTFOLIO_CONCENTRATION_THRESHOLD &&
        riskScore >= PORTFOLIO_HIGH_RISK_THRESHOLD;

      return {
        id: item.pos.id,
        assetId: item.pos.assetId,
        symbol: item.pos.asset.symbol,
        name: item.pos.asset.name,
        currency: item.pos.asset.currency,
        quantity: item.quantity,
        averageBuyPrice: Math.round(item.avgPrice * 10000) / 10000,
        currentPrice: Math.round(item.currentPrice * 10000) / 10000,
        marketValue: Math.round(item.marketValue * 100) / 100,
        costBasis: Math.round(item.costBasis * 100) / 100,
        unrealizedPnL: Math.round(item.unrealizedPnL * 100) / 100,
        unrealizedPnLPercent: Math.round(item.unrealizedPnLPercent * 100) / 100,
        realizedPnL: Math.round(item.realizedPnL * 100) / 100,
        totalPnL: Math.round((item.unrealizedPnL + item.realizedPnL) * 100) / 100,
        weightPercent: Math.round(weightPercent * 10) / 10,
        signal: item.signal,
        isConcentratedRiskWarning,
        status: item.pos.status,
      };
    });

    const portfolioRiskScore = Math.round(weightedRiskSum * 10) / 10;
    const isHighRiskWarning =
      portfolioRiskScore >= PORTFOLIO_HIGH_RISK_THRESHOLD ||
      positionSummaries.some((p) => p.isConcentratedRiskWarning);

    const totalPnL = totalUnrealizedPnL + totalRealizedPnL;
    const unrealizedPnLPercent =
      totalCostBasis > 0 ? (totalUnrealizedPnL / totalCostBasis) * 100 : 0;

    return {
      id: portfolio.id,
      name: portfolio.name,
      currency: portfolio.currency,
      cashBalance: Math.round(cashBalance * 100) / 100,
      equityValue: Math.round(equityValue * 100) / 100,
      totalValue: Math.round(totalValue * 100) / 100,
      totalCostBasis: Math.round(totalCostBasis * 100) / 100,
      unrealizedPnL: Math.round(totalUnrealizedPnL * 100) / 100,
      unrealizedPnLPercent: Math.round(unrealizedPnLPercent * 100) / 100,
      realizedPnL: Math.round(totalRealizedPnL * 100) / 100,
      totalPnL: Math.round(totalPnL * 100) / 100,
      portfolioRiskScore,
      positions: positionSummaries,
      isHighRiskWarning,
    };
  }

  /**
   * Wykonanie transakcji (Kupno / Sprzedaż) w atomowej transakcji DB.
   * Gwarantuje:
   * - Niezmienność averageBuyPrice przy sprzedaży (SELL)
   * - Prawidłowe naliczenie realizedPnL przy sprzedaży
   * - Zmianę statusu na CLOSED przy sprzedaży do 0 bez utraty historii
   * - Zapis w dzienniku transakcji PortfolioTransaction oraz w CashTransaction
   * - Weryfikację waluty i ochronę IDOR
   */
  async executeTrade(userId: string, input: ExecuteTradeInput) {
    const data = ExecuteTradeSchema.parse(input);
    const portfolio = await this.getOrCreateDefaultPortfolio(userId);

    const asset = await marketService.getOrCreateAsset(data.symbol);

    // Weryfikacja spójności walutowej
    if (asset.currency !== portfolio.currency) {
      throw new Error(
        `Waluta instrumentu (${asset.currency}) różni się od waluty portfela (${portfolio.currency}). Wielowalutowość wymaga modułu przewalutowań FX.`
      );
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Sprawdź istniejącą pozycję
      const existingPos = await tx.portfolioPosition.findUnique({
        where: {
          portfolioId_assetId: {
            portfolioId: portfolio.id,
            assetId: asset.id,
          },
        },
      });

      const tradeQuantity = data.quantity;
      const tradePrice = data.price;
      const tradeFee = data.fee ?? 0;
      const tradeTotalValue = tradeQuantity * tradePrice;
      const tradeDate = data.executedAt ? new Date(data.executedAt) : new Date();

      if (data.type === "BUY") {
        const oldQty = existingPos ? Number(existingPos.quantity) : 0;
        const oldAvg = existingPos ? Number(existingPos.averageBuyPrice) : 0;
        const newQty = oldQty + tradeQuantity;
        // Średnia ważona cena zakupu
        const newAvg = (oldQty * oldAvg + tradeQuantity * tradePrice) / newQty;

        // Upsert pozycji
        await tx.portfolioPosition.upsert({
          where: {
            portfolioId_assetId: {
              portfolioId: portfolio.id,
              assetId: asset.id,
            },
          },
          create: {
            portfolioId: portfolio.id,
            assetId: asset.id,
            quantity: newQty,
            averageBuyPrice: newAvg,
            realizedPnL: 0,
            status: "ACTIVE",
          },
          update: {
            quantity: newQty,
            averageBuyPrice: newAvg,
            status: "ACTIVE",
            closedAt: null,
          },
        });

        // Wpis do dziennika transakcji akcji
        const transaction = await tx.portfolioTransaction.create({
          data: {
            portfolioId: portfolio.id,
            assetId: asset.id,
            type: "BUY",
            quantity: tradeQuantity,
            price: tradePrice,
            totalValue: tradeTotalValue,
            fee: tradeFee,
            notes: data.notes,
            executedAt: tradeDate,
          },
        });

        // Wypływ gotówki (wartość zakupu + prowizja)
        const cashOutflow = tradeTotalValue + tradeFee;
        const currentPortfolio = await tx.portfolio.findUniqueOrThrow({
          where: { id: portfolio.id },
        });
        const currentCash = Number(currentPortfolio.cashBalance);
        const newCash = currentCash - cashOutflow;

        await tx.portfolio.update({
          where: { id: portfolio.id },
          data: { cashBalance: newCash },
        });

        await tx.cashTransaction.create({
          data: {
            portfolioId: portfolio.id,
            type: "BUY",
            amount: cashOutflow,
            balanceAfter: newCash,
            description: `Kupno ${tradeQuantity} ${asset.symbol} po cenie ${tradePrice} ${asset.currency}`,
            createdAt: tradeDate,
          },
        });

        return transaction;
      } else {
        // SELL
        if (!existingPos || existingPos.status !== "ACTIVE" || Number(existingPos.quantity) < tradeQuantity) {
          const available = existingPos && existingPos.status === "ACTIVE" ? Number(existingPos.quantity) : 0;
          throw new Error(
            `Niewystarczająca liczba akcji do sprzedaży. Posiadasz: ${available}, próbowano sprzedać: ${tradeQuantity}.`
          );
        }

        const oldQty = Number(existingPos.quantity);
        const avgPrice = Number(existingPos.averageBuyPrice); // Średnia cena zakupu NIE ulega zmianie!
        const remainingQty = oldQty - tradeQuantity;

        // Realized PnL z tej transakcji = Q_sprzedane * (Cena_sprzedaży - Średnia_cena_zakupu)
        const tradeRealizedPnL = tradeQuantity * (tradePrice - avgPrice);
        const newRealizedPnL = Number(existingPos.realizedPnL) + tradeRealizedPnL;

        if (remainingQty === 0) {
          await tx.portfolioPosition.update({
            where: { id: existingPos.id },
            data: {
              quantity: 0,
              averageBuyPrice: avgPrice, // zachowujemy średnią historyczną
              realizedPnL: newRealizedPnL,
              status: "CLOSED",
              closedAt: tradeDate,
            },
          });
        } else {
          await tx.portfolioPosition.update({
            where: { id: existingPos.id },
            data: {
              quantity: remainingQty,
              averageBuyPrice: avgPrice, // niezmieniona!
              realizedPnL: newRealizedPnL,
              status: "ACTIVE",
            },
          });
        }

        // Zapis w dzienniku transakcji akcji
        const transaction = await tx.portfolioTransaction.create({
          data: {
            portfolioId: portfolio.id,
            assetId: asset.id,
            type: "SELL",
            quantity: tradeQuantity,
            price: tradePrice,
            totalValue: tradeTotalValue,
            fee: tradeFee,
            notes: data.notes,
            executedAt: tradeDate,
          },
        });

        // Wpływ gotówki (wartość sprzedaży - prowizja)
        const cashInflow = tradeTotalValue - tradeFee;
        const currentPortfolio = await tx.portfolio.findUniqueOrThrow({
          where: { id: portfolio.id },
        });
        const currentCash = Number(currentPortfolio.cashBalance);
        const newCash = currentCash + cashInflow;

        await tx.portfolio.update({
          where: { id: portfolio.id },
          data: { cashBalance: newCash },
        });

        await tx.cashTransaction.create({
          data: {
            portfolioId: portfolio.id,
            type: "SELL",
            amount: cashInflow,
            balanceAfter: newCash,
            description: `Sprzedaż ${tradeQuantity} ${asset.symbol} po cenie ${tradePrice} ${asset.currency}`,
            createdAt: tradeDate,
          },
        });

        return transaction;
      }
    });
  }

  /**
   * Operacje gotówkowe (Wpłata, Wypłata, Korekta) z rejestracją w Cash Ledger.
   */
  async executeCashOperation(userId: string, input: CashOperationInput) {
    const data = CashOperationSchema.parse(input);
    const portfolio = await this.getOrCreateDefaultPortfolio(userId);

    return await prisma.$transaction(async (tx) => {
      const currentPortfolio = await tx.portfolio.findUniqueOrThrow({
        where: { id: portfolio.id },
      });

      const currentCash = Number(currentPortfolio.cashBalance);
      let newCash = currentCash;

      if (data.type === "DEPOSIT") {
        newCash = currentCash + data.amount;
      } else if (data.type === "WITHDRAWAL") {
        if (currentCash < data.amount) {
          throw new Error(
            `Niewystarczające saldo gotówki. Posiadasz: ${currentCash.toFixed(2)} ${portfolio.currency}, próbowano wypłacić: ${data.amount.toFixed(2)} ${portfolio.currency}.`
          );
        }
        newCash = currentCash - data.amount;
      } else if (data.type === "ADJUSTMENT") {
        // Bezpośrednie ustawienie salda (korekta bilansowa)
        newCash = data.amount;
      }

      await tx.portfolio.update({
        where: { id: portfolio.id },
        data: { cashBalance: newCash },
      });

      const cashTx = await tx.cashTransaction.create({
        data: {
          portfolioId: portfolio.id,
          type: data.type,
          amount: data.amount,
          balanceAfter: newCash,
          description: data.description || `Operacja gotówkowa: ${data.type}`,
        },
      });

      return cashTx;
    });
  }

  /**
   * Anulowanie / usunięcie błędnie dodanej pozycji z twardą weryfikacją IDOR.
   */
  async deletePosition(userId: string, positionId: string) {
    const position = await prisma.portfolioPosition.findUnique({
      where: { id: positionId },
      include: { portfolio: true },
    });

    if (!position || position.portfolio.userId !== userId) {
      throw new Error("Pozycja nie została odnaleziona lub brak uprawnień dostępu.");
    }

    await prisma.portfolioPosition.delete({
      where: { id: positionId },
    });

    return { success: true };
  }

  /**
   * Pobranie historii transakcji akcji (Trade Log) z paginacją.
   */
  async getTransactions(
    userId: string,
    page = 1,
    limit = 50
  ): Promise<{ transactions: PortfolioTransactionDto[]; total: number }> {
    const portfolio = await this.getOrCreateDefaultPortfolio(userId);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.portfolioTransaction.findMany({
        where: { portfolioId: portfolio.id },
        include: { asset: true },
        orderBy: { executedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.portfolioTransaction.count({
        where: { portfolioId: portfolio.id },
      }),
    ]);

    return {
      transactions: transactions.map((t) => ({
        id: t.id,
        assetSymbol: t.asset.symbol,
        assetName: t.asset.name,
        type: t.type,
        quantity: Number(t.quantity),
        price: Number(t.price),
        totalValue: Number(t.totalValue),
        fee: Number(t.fee),
        notes: t.notes,
        executedAt: t.executedAt.toISOString(),
      })),
      total,
    };
  }

  /**
   * Pobranie historii operacji gotówkowych (Cash Ledger) z paginacją.
   */
  async getCashTransactions(
    userId: string,
    page = 1,
    limit = 50
  ): Promise<{ transactions: CashTransactionDto[]; total: number }> {
    const portfolio = await this.getOrCreateDefaultPortfolio(userId);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.cashTransaction.findMany({
        where: { portfolioId: portfolio.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.cashTransaction.count({
        where: { portfolioId: portfolio.id },
      }),
    ]);

    return {
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        balanceAfter: Number(t.balanceAfter),
        description: t.description,
        createdAt: t.createdAt.toISOString(),
      })),
      total,
    };
  }

  /**
   * Pobranie listy obserwowanych spółek (Watchlist) użytkownika wraz z kursami i sygnałami.
   */
  async getWatchlist(userId: string): Promise<WatchlistItemSummary[]> {
    const items = await prisma.watchlist.findMany({
      where: { userId },
      include: { asset: true },
      orderBy: { createdAt: "desc" },
    });

    const results = await Promise.all(
      items.map(async (item) => {
        const symbol = item.asset.symbol;
        const [quoteRes, signalRes] = await Promise.allSettled([
          marketService.getQuote(symbol),
          signalService.getOrGenerateSignal(symbol),
        ]);

        const currentPrice =
          quoteRes.status === "fulfilled" ? quoteRes.value.price : 0;
        const changePercent =
          quoteRes.status === "fulfilled" ? quoteRes.value.changePercent : 0;

        const opportunityScore =
          signalRes.status === "fulfilled" ? signalRes.value.opportunityScore : null;
        const riskScore =
          signalRes.status === "fulfilled" ? signalRes.value.riskScore : null;
        const confidenceScore =
          signalRes.status === "fulfilled" ? signalRes.value.confidenceScore : null;
        const direction =
          signalRes.status === "fulfilled" ? signalRes.value.direction : null;

        return {
          id: item.id,
          assetId: item.assetId,
          symbol,
          name: item.asset.name,
          currency: item.asset.currency,
          currentPrice: Math.round(currentPrice * 10000) / 10000,
          changePercent: Math.round(changePercent * 100) / 100,
          opportunityScore,
          riskScore,
          confidenceScore,
          direction,
          addedAt: item.createdAt.toISOString(),
        };
      })
    );

    return results;
  }

  /**
   * Dodanie symbolu do obserwowanych z weryfikacją IDOR (izolacja per userId).
   */
  async addToWatchlist(userId: string, symbol: string) {
    const asset = await marketService.getOrCreateAsset(symbol);

    const watchlistItem = await prisma.watchlist.upsert({
      where: {
        userId_assetId: {
          userId,
          assetId: asset.id,
        },
      },
      create: {
        userId,
        assetId: asset.id,
      },
      update: {},
    });

    return watchlistItem;
  }

  /**
   * Usunięcie symbolu z obserwowanych z weryfikacją IDOR.
   */
  async removeFromWatchlist(userId: string, symbol: string) {
    const normSymbol = symbol.trim().toUpperCase();
    const asset = await prisma.asset.findUnique({
      where: { symbol: normSymbol },
    });

    if (!asset) {
      return { success: false };
    }

    await prisma.watchlist.deleteMany({
      where: {
        userId,
        assetId: asset.id,
      },
    });

    return { success: true };
  }
}

export const portfolioService = new PortfolioService();
