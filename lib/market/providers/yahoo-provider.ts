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
  }

  async getHistoricalPrices(symbol: string, params: HistoricalPriceParams): Promise<OHLCV[]> {
    const period1 = params.from;
    const period2 = params.to || new Date();

    // Mapowanie interwałów pod yahoo-finance2
    let interval: "1d" | "1wk" | "1mo" = "1d";
    if (params.interval === "1w") {
      interval = "1wk";
    }

    const raw = (await yahooFinance.historical(symbol, {
      period1,
      period2,
      interval,
    })) as unknown[];

    if (!Array.isArray(raw) || raw.length === 0) {
      return [];
    }

    return validateAndDeduplicateCandles(raw);
  }
}
