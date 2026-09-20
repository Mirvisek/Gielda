export type CandleInterval =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d"
  | "1w";

export type HistoricalRange = "1w" | "1m" | "3m" | "6m" | "1y" | "5y";

export interface MarketQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: Date;
  currency: string;
  source: string;
}

export interface OHLCV {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose?: number;
}

export interface HistoricalPriceParams {
  from: Date;
  to: Date;
  interval?: CandleInterval;
}

export interface IMarketDataProvider {
  readonly name: string;
  getQuote(symbol: string): Promise<MarketQuote>;
  getHistoricalPrices(symbol: string, params: HistoricalPriceParams): Promise<OHLCV[]>;
}

export interface TechnicalIndicators {
  currentPrice: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  rsi14: number | null;
  atr14: number | null;
  return1d: number | null;
  return5d: number | null;
  return20d: number | null;
  return60d: number | null;
  volumeChangePercent: number | null;
  volumeRatio20d: number | null;
}
