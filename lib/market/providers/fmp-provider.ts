import { IMarketDataProvider, MarketQuote, OHLCV, HistoricalPriceParams } from "../types";
import { validateAndDeduplicateCandles } from "../validation";

export class FMPProvider implements IMarketDataProvider {
  readonly name = "fmp";
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.FMP_API_KEY || "";
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    if (!this.apiKey) {
      throw new Error("FMP_API_KEY nie został skonfigurowany.");
    }

    const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(symbol)}?apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Błąd FMP API: ${res.statusText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`Brak danych dla symbolu ${symbol} w FMP.`);
    }

    const q = data[0];
    return {
      symbol: q.symbol,
      price: q.price,
      change: q.change,
      changePercent: q.changesPercentage,
      volume: q.volume,
      high: q.dayHigh,
      low: q.dayLow,
      open: q.open,
      previousClose: q.previousClose,
      timestamp: new Date(q.timestamp * 1000),
      currency: "USD",
      source: this.name,
    };
  }

  async getHistoricalPrices(symbol: string, params: HistoricalPriceParams): Promise<OHLCV[]> {
    if (!this.apiKey) {
      throw new Error("FMP_API_KEY nie został skonfigurowany.");
    }

    const fromStr = params.from.toISOString().split("T")[0];
    const toStr = params.to.toISOString().split("T")[0];
    const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(symbol)}?from=${fromStr}&to=${toStr}&apikey=${this.apiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Błąd FMP historical API: ${res.statusText}`);

    const data = await res.json();
    const list = data.historical || [];
    return validateAndDeduplicateCandles(list);
  }
}
