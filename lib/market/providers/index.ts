import { IMarketDataProvider } from "../types";
import { YahooFinanceProvider } from "./yahoo-provider";
import { FMPProvider } from "./fmp-provider";
import { PolygonProvider } from "./polygon-provider";
import { AlphaVantageProvider } from "./alpha-vantage-provider";

const providers: Record<string, IMarketDataProvider> = {};

export function getMarketDataProvider(name?: string): IMarketDataProvider {
  const providerName = (name || process.env.MARKET_DATA_PROVIDER || "yahoo").toLowerCase().trim();

  if (providers[providerName]) {
    return providers[providerName];
  }

  let provider: IMarketDataProvider;

  switch (providerName) {
    case "fmp":
      provider = new FMPProvider();
      break;
    case "polygon":
      provider = new PolygonProvider();
      break;
    case "alphavantage":
    case "alpha_vantage":
      provider = new AlphaVantageProvider();
      break;
    case "yahoo":
    default:
      provider = new YahooFinanceProvider();
      break;
  }

  providers[providerName] = provider;
  return provider;
}
