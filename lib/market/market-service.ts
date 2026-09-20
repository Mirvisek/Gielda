import prisma from "@/lib/db/prisma";
import { CandleInterval, MarketQuote, OHLCV, TechnicalIndicators } from "./types";
import { getMarketDataProvider } from "./providers";
import { CACHE_TTL, getFromCache, setInCache } from "./cache";
import { calculateAllTechnicalIndicators } from "./indicators";
import { Prisma } from "@prisma/client";

const BENCHMARK_SYMBOLS = ["SPY", "QQQ", "GLD", "USO"];

export const POLISH_TICKER_MAP: Record<string, string> = {
  PKOBP: "PKO.WA",
  PKO: "PKO.WA",
  PKNORLEN: "PKN.WA",
  ORLEN: "PKN.WA",
  PKN: "PKN.WA",
  CDPROJEKT: "CDR.WA",
  CDP: "CDR.WA",
  CDR: "CDR.WA",
  KGHM: "KGH.WA",
  KGH: "KGH.WA",
  PEKAO: "PEO.WA",
  PEO: "PEO.WA",
  PZU: "PZU.WA",
  DINO: "DNP.WA",
  DINOPOLSKA: "DNP.WA",
  DNP: "DNP.WA",
  LPP: "LPP.WA",
  ALLEGRO: "ALE.WA",
  ALE: "ALE.WA",
  GRUPAAZOTY: "ATT.WA",
  AZOTY: "ATT.WA",
  ATT: "ATT.WA",
  JSW: "JSW.WA",
  PGE: "PGE.WA",
  SANPL: "SPL.WA",
  SANTANDER: "SPL.WA",
  MBANK: "MBK.WA",
  MBK: "MBK.WA",
  ORANGE: "OPL.WA",
  OPL: "OPL.WA",
  CYFRPLSAT: "CPS.WA",
  CYFROWYPOLSAT: "CPS.WA",
  CPS: "CPS.WA",
  CCC: "CCC.WA",
  KRUK: "KRU.WA",
  KRU: "KRU.WA",
  PEPCO: "PCO.WA",
  PCO: "PCO.WA",
  ALIOR: "ALR.WA",
  ALR: "ALR.WA",
  BUDIMEX: "BDX.WA",
  BDX: "BDX.WA",
  TAURON: "TPE.WA",
  TPE: "TPE.WA",
  ENEA: "ENA.WA",
  ENA: "ENA.WA",
  XTB: "XTB.WA",
  ASSECO: "ACP.WA",
  ACP: "ACP.WA",
  TEXT: "TXT.WA",
};

export function resolveMarketSymbol(input: string): string {
  if (!input) return "";
  const clean = input.trim().toUpperCase().replace(/\s+/g, "");
  return POLISH_TICKER_MAP[clean] || clean;
}

export class MarketService {
  /**
   * 1. Pobiera lub tworzy aktywo w bazie MariaDB.
   */
  async getOrCreateAsset(symbol: string) {
    const normSymbol = resolveMarketSymbol(symbol);

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
    const normSymbol = resolveMarketSymbol(symbol);
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
    const normSymbol = resolveMarketSymbol(symbol);
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
   * 6. Wyszukiwarka aktywów: wyszukuje w lokalnej bazie oraz na żywo w Yahoo Finance API.
   */
  async searchAssets(query: string) {
    const raw = query.trim();
    if (!raw) return [];

    const norm = raw.toUpperCase();
    const mappedSymbol = resolveMarketSymbol(norm);

    // 1. Sprawdź lokalną bazę MariaDB
    const localAssets = await prisma.asset.findMany({
      where: {
        OR: [
          { symbol: { contains: norm } },
          { symbol: { contains: mappedSymbol } },
          { name: { contains: raw } },
        ],
        isActive: true,
      },
      take: 15,
    });

    const seenSymbols = new Set<string>(localAssets.map((a) => a.symbol.toUpperCase()));
    const results: Array<{
      symbol: string;
      name: string;
      currency?: string;
      exchange?: string;
      type?: string;
    }> = localAssets.map((a) => ({
      symbol: a.symbol,
      name: a.name,
      currency: a.currency,
      exchange: a.exchange || undefined,
      type: a.assetType,
    }));

    // 2. Jeśli szukany symbol ma bezpośrednie mapowanie (np. PKOBP -> PKO.WA), dodaj je
    if (mappedSymbol !== norm && !seenSymbols.has(mappedSymbol)) {
      seenSymbols.add(mappedSymbol);
      results.unshift({
        symbol: mappedSymbol,
        name: `${norm} (Giełda Papierów Wartościowych)`,
        currency: "PLN",
        exchange: "WSE",
        type: "EQUITY",
      });
    }

    // 3. Wyszukaj na żywo przez Yahoo Finance Search API
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
        raw
      )}&quotesCount=10&newsCount=0`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "*/*",
        },
      });

      if (res.ok) {
        interface YahooSearchQuote {
          symbol?: string;
          shortname?: string;
          longname?: string;
          exchange?: string;
          exchDisp?: string;
          quoteType?: string;
          typeDisp?: string;
        }

        const data = await res.json();
        const quotes: YahooSearchQuote[] = (data.quotes as YahooSearchQuote[]) || [];

        for (const q of quotes) {
          const sym = q.symbol ? String(q.symbol).trim().toUpperCase() : null;
          if (!sym || seenSymbols.has(sym)) continue;
          if (q.quoteType === "OPTION") continue;

          seenSymbols.add(sym);
          const name = q.shortname || q.longname || sym;

          results.push({
            symbol: sym,
            name,
            exchange: q.exchange || q.exchDisp,
            type: q.quoteType || q.typeDisp,
          });

          // Zapisz/zaktualizuj w bazie MariaDB
          prisma.asset
            .upsert({
              where: { symbol: sym },
              update: { name },
              create: {
                symbol: sym,
                name,
                currency: sym.endsWith(".WA") ? "PLN" : "USD",
                isActive: true,
              },
            })
            .catch(() => {});
        }
      }
    } catch (e) {
      console.error("[MarketService searchAssets error]:", e);
    }

    return results;
  }
}

export const marketService = new MarketService();
