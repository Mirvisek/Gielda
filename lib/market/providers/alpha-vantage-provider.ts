import { IMarketDataProvider, MarketQuote, OHLCV, HistoricalPriceParams } from "../types";
import { validateAndDeduplicateCandles } from "../validation";

export class AlphaVantageProvider implements IMarketDataProvider {
  readonly name = "alphavantage";
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ALPHA_VANTAGE_API_KEY || "";
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    if (!this.apiKey) throw new Error("ALPHA_VANTAGE_API_KEY nie został skonfigurowany.");

    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Błąd Alpha Vantage API: ${res.statusText}`);

    const data = await res.json();
    const gq = data["Global Quote"];
    if (!gq || !gq["05. price"]) throw new Error(`Brak danych dla ${symbol} w Alpha Vantage.`);

    const price = Number(gq["05. price"]);
    const open = Number(gq["02. open"]);
    const high = Number(gq["03. high"]);
    const low = Number(gq["04. low"]);
    const volume = Number(gq["06. volume"]);
    const prevClose = Number(gq["08. previous close"]);
    const change = Number(gq["09. change"]);
    const changePercent = parseFloat(gq["10. change percent"]);

    return {
      symbol: symbol.toUpperCase(),
      price,
      change,
      changePercent,
      volume,
      high,
      low,
      open,
      previousClose: prevClose,
      timestamp: new Date(),
      currency: "USD",
      source: this.name,
    };
  }

  async getHistoricalPrices(symbol: string, params: HistoricalPriceParams): Promise<OHLCV[]> {
    if (!this.apiKey) throw new Error("ALPHA_VANTAGE_API_KEY nie został skonfigurowany.");

    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Błąd Alpha Vantage historical: ${res.statusText}`);

    const data = (await res.json()) as { [key: string]: Record<string, Record<string, string>> };
    const ts = data["Time Series (Daily)"] || {};

    let candles: OHLCV[] = Object.entries(ts).map(
      ([dateStr, values]: [string, Record<string, string>]) => ({
        timestamp: new Date(dateStr),
        open: Number(values["1. open"]),
        high: Number(values["2. high"]),
        low: Number(values["3. low"]),
        close: Number(values["4. close"]),
        volume: Number(values["5. volume"]),
      })
    );

    if (params.from || params.to) {
      candles = candles.filter((c) => {
        if (params.from && c.timestamp < params.from) return false;
        if (params.to && c.timestamp > params.to) return false;
        return true;
      });
    }

    return validateAndDeduplicateCandles(candles);
  }
}
