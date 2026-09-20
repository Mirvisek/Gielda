/**
 * MARKET WORKER — Asynchroniczny proces pobierania danych rynkowych i wyliczania wskaźników
 * Uruchamiany jako osobny proces w PM2: npx tsx server/workers/market-worker.ts
 */

import dotenv from "dotenv";
dotenv.config();

import { marketService } from "../../lib/market/market-service";

const SYMBOLS_TO_MONITOR = ["SPY", "QQQ", "GLD", "USO", "AAPL", "NVDA", "MSFT"];
const QUOTE_INTERVAL_MS = 2 * 60 * 1000; // Co 2 minuty
const HISTORY_INTERVAL_MS = 60 * 60 * 1000; // Co godzinę

export async function runQuoteSyncJob() {
  console.log(`[${new Date().toISOString()}] [MarketWorker] Rozpoczynanie cyklu aktualizacji notowań...`);
  for (const symbol of SYMBOLS_TO_MONITOR) {
    try {
      const quote = await marketService.getQuote(symbol);
      console.log(`[MarketWorker] Zaktualizowano ${symbol}: $${quote.price} (${quote.changePercent}%)`);
    } catch (err) {
      console.error(`[MarketWorker] Błąd aktualizacji ${symbol}:`, err);
    }
  }
}

export async function runHistorySyncJob() {
  console.log(`[${new Date().toISOString()}] [MarketWorker] Synchronizacja świec historycznych...`);
  for (const symbol of SYMBOLS_TO_MONITOR) {
    try {
      const candles = await marketService.getHistoricalPrices(symbol, "1d", "1m");
      console.log(`[MarketWorker] Zsynchronizowano ${candles.length} świec dla ${symbol}`);
    } catch (err) {
      console.error(`[MarketWorker] Błąd synchronizacji historii dla ${symbol}:`, err);
    }
  }
}

async function start() {
  console.log("[MarketWorker] Uruchomiono worker notowań rynkowych (interwał: 2 min).");

  // Pierwsze wykonanie od razu po starcie
  await runQuoteSyncJob();

  // Kolejne cykle w interwale
  const quoteTimer = setInterval(runQuoteSyncJob, QUOTE_INTERVAL_MS);
  const historyTimer = setInterval(runHistorySyncJob, HISTORY_INTERVAL_MS);

  const shutdown = () => {
    console.log("[MarketWorker] Zatrzymywanie workera notowań...");
    clearInterval(quoteTimer);
    clearInterval(historyTimer);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error("[MarketWorker Fatal Error]:", err);
  process.exit(1);
});
