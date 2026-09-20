import { IMarketDataProvider, MarketQuote, OHLCV, HistoricalPriceParams } from "../types";
import { validateAndDeduplicateCandles } from "../validation";

export class PolygonProvider implements IMarketDataProvider {
  readonly name = "polygon";
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.POLYGON_API_KEY || "";
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    if (!this.apiKey) throw new Error("POLYGON_API_KEY nie został skonfigurowany.");

    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/prev?apiKey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Błąd Polygon API: ${res.statusText}`);

    const data = await res.json();
    const result = data.results?.[0];
    if (!result) throw new Error(`Brak notowań dla ${symbol} w Polygon.`);

    return {
      symbol: symbol.toUpperCase(),
      price: result.c,
      change: result.c - result.o,
      changePercent: Number((((result.c - result.o) / result.o) * 100).toFixed(2)),
      volume: result.v,
      high: result.h,
      low: result.l,
      open: result.o,
      previousClose: result.o,
      timestamp: new Date(result.t),
      currency: "USD",
      source: this.name,
    };
  }

  async getHistoricalPrices(symbol: string, params: HistoricalPriceParams): Promise<OHLCV[]> {
    if (!this.apiKey) throw new Error("POLYGON_API_KEY nie został skonfigurowany.");

    const fromStr = params.from.toISOString().split("T")[0];
    const toStr = params.to.toISOString().split("T")[0];
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${fromStr}/${toStr}?apiKey=${this.apiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Błąd Polygon historical API: ${res.statusText}`);

    const data = await res.json();
    const candles = (data.results || []).map(
      (r: { t: number; o: number; h: number; l: number; c: number; v: number }) => ({
        timestamp: new Date(r.t),
        open: r.o,
        high: r.h,
        low: r.l,
        close: r.c,
        volume: r.v,
      })
    );

    return validateAndDeduplicateCandles(candles);
  }
}
