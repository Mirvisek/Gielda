import yahooFinance from "yahoo-finance2";
import { IMarketDataProvider, MarketQuote, OHLCV, HistoricalPriceParams } from "../types";
import { validateAndDeduplicateCandles } from "../validation";

interface YahooQuoteResponse {
  symbol?: string;
  regularMarketPrice?: number;
  ask?: number;
  bid?: number;
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketOpen?: number;
  regularMarketTime?: Date | string | number;
  currency?: string;
}

export class YahooFinanceProvider implements IMarketDataProvider {
  readonly name = "yahoo";

  constructor() {
    try {
      yahooFinance.suppressNotices(["yahooSurvey"]);
    } catch {
      // Ignoruj błąd wyciszania
    }
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    try {
      const raw = (await yahooFinance.quote(symbol)) as YahooQuoteResponse;

      if (!raw) {
        throw new Error(`Brak notowań dla symbolu ${symbol} w Yahoo Finance.`);
      }

      const price = Number(raw.regularMarketPrice || raw.ask || raw.bid || 0);
      const prevClose = Number(raw.regularMarketPreviousClose || price);
      const change = Number(raw.regularMarketChange || price - prevClose);
      const changePercent = Number(
        raw.regularMarketChangePercent !== undefined
          ? raw.regularMarketChangePercent
          : prevClose > 0
          ? ((price - prevClose) / prevClose) * 100
          : 0
      );

      return {
        symbol: raw.symbol || symbol.toUpperCase(),
        price: Number(price.toFixed(4)),
        change: Number(change.toFixed(4)),
        changePercent: Number(changePercent.toFixed(2)),
        volume: Math.round(Number(raw.regularMarketVolume || 0)),
        high: Number((raw.regularMarketDayHigh || price).toFixed(4)),
        low: Number((raw.regularMarketDayLow || price).toFixed(4)),
        open: Number((raw.regularMarketOpen || price).toFixed(4)),
        previousClose: Number(prevClose.toFixed(4)),
        timestamp: raw.regularMarketTime ? new Date(raw.regularMarketTime) : new Date(),
        currency: raw.currency || "USD",
        source: this.name,
      };
    } catch {
      // Fallback: Bezpośrednie pobranie przez Yahoo Chart API (omija blokady EU consent / biblioteki)
      return await this.fetchQuoteDirect(symbol);
    }
  }

  private async fetchQuoteDirect(symbol: string): Promise<MarketQuote> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
      },
    });

    if (!res.ok) {
      throw new Error(`Brak notowań dla symbolu ${symbol} (status HTTP ${res.status}).`);
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      throw new Error(`Nie znaleziono danych dla symbolu ${symbol}.`);
    }

    const meta = result.meta;
    const price = Number(meta.regularMarketPrice || 0);
    const prevClose = Number(meta.previousClose || meta.chartPreviousClose || price);
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: meta.symbol || symbol.toUpperCase(),
      price: Number(price.toFixed(4)),
      change: Number(change.toFixed(4)),
      changePercent: Number(changePercent.toFixed(2)),
      volume: Math.round(Number(meta.regularMarketVolume || 0)),
      high: Number((meta.regularMarketDayHigh || price).toFixed(4)),
      low: Number((meta.regularMarketDayLow || price).toFixed(4)),
      open: Number((meta.regularMarketDayLow || price).toFixed(4)),
      previousClose: Number(prevClose.toFixed(4)),
      timestamp: new Date(meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now()),
      currency: meta.currency || "USD",
      source: "yahoo-direct",
    };
  }

  async getHistoricalPrices(symbol: string, params: HistoricalPriceParams): Promise<OHLCV[]> {
    const period1 = params.from;
    const period2 = params.to || new Date();

    let interval: "1d" | "1wk" | "1mo" = "1d";
    if (params.interval === "1w") {
      interval = "1wk";
    }

    try {
      const raw = (await yahooFinance.historical(symbol, {
        period1,
        period2,
        interval,
      })) as unknown[];

      if (Array.isArray(raw) && raw.length > 0) {
        return validateAndDeduplicateCandles(raw);
      }
    } catch {
      // Fallback do bezpośredniego chart API w razie błędu biblioteki
    }

    return await this.fetchHistoricalDirect(symbol, params);
  }

  private async fetchHistoricalDirect(
    symbol: string,
    params: HistoricalPriceParams
  ): Promise<OHLCV[]> {
    const p1 = Math.floor(params.from.getTime() / 1000);
    const p2 = Math.floor((params.to || new Date()).getTime() / 1000);
    const interval = params.interval === "1w" ? "1wk" : "1d";

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?period1=${p1}&period2=${p2}&interval=${interval}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
      },
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result || !result.timestamp) {
      return [];
    }

    const timestamps: number[] = result.timestamp;
    const quote = result.indicators?.quote?.[0] || {};
    const adjclose = result.indicators?.adjclose?.[0]?.adjclose;

    const candles: OHLCV[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      const volume = quote.volume?.[i] || 0;

      if (open != null && high != null && low != null && close != null) {
        candles.push({
          timestamp: new Date(timestamps[i] * 1000),
          open: Number(open),
          high: Number(high),
          low: Number(low),
          close: Number(close),
          volume: Number(volume),
          adjustedClose: adjclose?.[i] != null ? Number(adjclose[i]) : undefined,
        });
      }
    }

    return validateAndDeduplicateCandles(candles);
  }
}
