import prisma from "@/lib/db/prisma";
import { CandleInterval, MarketQuote, OHLCV, TechnicalIndicators } from "./types";
import { getMarketDataProvider } from "./providers";
import { CACHE_TTL, getFromCache, setInCache } from "./cache";
import { calculateAllTechnicalIndicators } from "./indicators";
import { Prisma } from "@prisma/client";

const BENCHMARK_SYMBOLS = ["SPY", "QQQ", "GLD", "USO"];

export class MarketService {
  /**
   * 1. Pobiera lub tworzy aktywo w bazie MariaDB.
   */
  async getOrCreateAsset(symbol: string) {
    const normSymbol = symbol.trim().toUpperCase();

    let asset = await prisma.asset.findUnique({
      where: { symbol: normSymbol },
    });

    if (asset) return asset;

    // Pobierz podstawowe dane od providera, aby uzupełnić metadane
    const provider = getMarketDataProvider();
    let name = normSymbol;
    let currency = "USD";

    try {
      const quote = await provider.getQuote(normSymbol);
      name = quote.symbol;
      currency = quote.currency || "USD";
    } catch {
      // Domyślne wartości w razie błędu providera
    }

    asset = await prisma.asset.create({
      data: {
        symbol: normSymbol,
        name,
        currency,
        isActive: true,
      },
    });

    return asset;
  }

  /**
   * 2. Pobiera bieżące notowanie (z buforem Redis 60s).
   */
  async getQuote(symbol: string): Promise<MarketQuote> {
    const normSymbol = symbol.trim().toUpperCase();
    const cacheKey = `quote:${normSymbol}`;

    // 1. Sprawdź cache
    const cached = await getFromCache<MarketQuote>(cacheKey);
    if (cached) {
      return {
        ...cached,
        timestamp: new Date(cached.timestamp),
      };
    }

    // 2. Pobierz od dostawcy
    const provider = getMarketDataProvider();
    const quote = await provider.getQuote(normSymbol);

    // 3. Zapisz w cache
    await setInCache(cacheKey, quote, CACHE_TTL.QUOTE);

    return quote;
  }

  /**
   * 3. Pobiera świece historyczne OHLCV (sprawdza cache -> bazę MariaDB -> pobiera od providera).
   */
  async getHistoricalPrices(
    symbol: string,
    interval: CandleInterval = "1d",
    range: "1w" | "1m" | "3m" | "6m" | "1y" | "5y" = "1m"
  ): Promise<OHLCV[]> {
    const normSymbol = symbol.trim().toUpperCase();
    const cacheKey = `history:${normSymbol}:${interval}:${range}`;

    // 1. Cache hit?
    const cached = await getFromCache<OHLCV[]>(cacheKey);
    if (cached && cached.length > 0) {
      return cached.map((c) => ({
        ...c,
        timestamp: new Date(c.timestamp),
      }));
    }

    // Wyznacz zakres dat
    const to = new Date();
    const from = new Date();
    switch (range) {
      case "1w":
        from.setDate(from.getDate() - 7);
        break;
      case "1m":
        from.setMonth(from.getMonth() - 1);
        break;
      case "3m":
        from.setMonth(from.getMonth() - 3);
        break;
      case "6m":
        from.setMonth(from.getMonth() - 6);
        break;
      case "1y":
        from.setFullYear(from.getFullYear() - 1);
        break;
      case "5y":
        from.setFullYear(from.getFullYear() - 5);
        break;
    }

    const asset = await this.getOrCreateAsset(normSymbol);

    // 2. Sprawdź świece w bazie MariaDB
    const dbPrices = await prisma.price.findMany({
      where: {
        assetId: asset.id,
        interval,
        timestamp: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { timestamp: "asc" },
    });

    // Jeśli baza ma wystarczająco dużo danych i najnowsza świeca jest świeża (sprzed max 2 dni)
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const isDbFresh =
      dbPrices.length > 5 && dbPrices[dbPrices.length - 1].timestamp >= twoDaysAgo;

    if (isDbFresh) {
      const candles: OHLCV[] = dbPrices.map((p) => ({
        timestamp: p.timestamp,
        open: Number(p.open),
        high: Number(p.high),
        low: Number(p.low),
        close: Number(p.close),
        volume: Number(p.volume),
        adjustedClose: p.adjustedClose ? Number(p.adjustedClose) : undefined,
      }));

      await setInCache(cacheKey, candles, CACHE_TTL.HISTORICAL);
      return candles;
    }

    // 3. Pobierz z Providera, zwaliduj i zapisz w MariaDB
    const provider = getMarketDataProvider();
    let candles: OHLCV[] = [];

    try {
      candles = await provider.getHistoricalPrices(normSymbol, { from, to, interval });

      if (candles.length > 0) {
        // Upsert do MariaDB z unikalnym kluczem (assetId, timestamp, interval, source)
        const sourceName = provider.name;
        const operations = candles.map((c) =>
          prisma.price.upsert({
            where: {
              assetId_timestamp_interval_source: {
                assetId: asset.id,
                timestamp: c.timestamp,
                interval,
                source: sourceName,
              },
            },
            update: {
              open: new Prisma.Decimal(c.open),
              high: new Prisma.Decimal(c.high),
              low: new Prisma.Decimal(c.low),
              close: new Prisma.Decimal(c.close),
              volume: new Prisma.Decimal(c.volume),
              adjustedClose: c.adjustedClose ? new Prisma.Decimal(c.adjustedClose) : null,
            },
            create: {
              assetId: asset.id,
              timestamp: c.timestamp,
              open: new Prisma.Decimal(c.open),
              high: new Prisma.Decimal(c.high),
              low: new Prisma.Decimal(c.low),
              close: new Prisma.Decimal(c.close),
              volume: new Prisma.Decimal(c.volume),
              adjustedClose: c.adjustedClose ? new Prisma.Decimal(c.adjustedClose) : null,
              interval,
              source: sourceName,
            },
          })
        );

        // Wykonaj w transakcji
        await prisma.$transaction(operations);
      }
    } catch (err) {
      console.error(`[MarketService] Błąd pobierania historii dla ${normSymbol}:`, err);
      // Jeśli provider zawiódł, zwróć to co mamy w bazie
      if (dbPrices.length > 0) {
        return dbPrices.map((p) => ({
          timestamp: p.timestamp,
          open: Number(p.open),
          high: Number(p.high),
          low: Number(p.low),
          close: Number(p.close),
          volume: Number(p.volume),
          adjustedClose: p.adjustedClose ? Number(p.adjustedClose) : undefined,
        }));
      }
    }

    await setInCache(cacheKey, candles, CACHE_TTL.HISTORICAL);
    return candles;
  }

  /**
   * 4. Wylicza wskaźniki techniczne na podstawie co najmniej 200 świec (z buforem 15m).
   */
  async getTechnicalIndicators(
    symbol: string,
    interval: CandleInterval = "1d"
  ): Promise<TechnicalIndicators> {
    const normSymbol = symbol.trim().toUpperCase();
    const cacheKey = `indicators:${normSymbol}:${interval}`;

    const cached = await getFromCache<TechnicalIndicators>(cacheKey);
    if (cached) return cached;

    // Pobierz roczną historię świec (dla wyliczenia SMA 200)
    const candles = await this.getHistoricalPrices(normSymbol, interval, "1y");
    const indicators = calculateAllTechnicalIndicators(candles);

    await setInCache(cacheKey, indicators, CACHE_TTL.INDICATORS);
    return indicators;
  }

  /**
   * 5. Pobiera przegląd benchmarków rynkowych (SPY, QQQ, GLD, USO).
   */
  async getMarketOverview(): Promise<MarketQuote[]> {
    const quotes = await Promise.all(
      BENCHMARK_SYMBOLS.map(async (sym) => {
        try {
          return await this.getQuote(sym);
        } catch {
          return null;
        }
      })
    );

    return quotes.filter((q): q is MarketQuote => q !== null);
  }

  /**
   * 6. Wyszukiwarka aktywów.
   */
  async searchAssets(query: string) {
    const norm = query.trim().toUpperCase();
    return await prisma.asset.findMany({
      where: {
        OR: [
          { symbol: { contains: norm } },
          { name: { contains: query.trim() } },
        ],
        isActive: true,
      },
      take: 20,
    });
  }
}

export const marketService = new MarketService();
