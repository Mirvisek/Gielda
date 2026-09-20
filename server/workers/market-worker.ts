/**
 * Market Worker - Asynchroniczny proces pobierania danych rynkowych i wyliczania wskaźników.
 * Uruchamiany jako osobny proces w PM2 (zgodnie z punktami 46, 47, 96).
 */
import { marketService } from "@/lib/market/market-service";

console.log("[Market Worker] Proces tła zainicjalizowany.");

const SYMBOLS_TO_MONITOR = ["SPY", "QQQ", "GLD", "USO", "AAPL", "NVDA", "MSFT"];

export async function runQuoteSyncJob() {
  console.log(`[Market Worker] Rozpoczynanie cyklu aktualizacji notowań (${new Date().toISOString()})...`);
  for (const symbol of SYMBOLS_TO_MONITOR) {
    try {
      const quote = await marketService.getQuote(symbol);
      console.log(`[Market Worker] Zaktualizowano ${symbol}: $${quote.price} (${quote.changePercent}%)`);
    } catch (err) {
      console.error(`[Market Worker] Błąd aktualizacji ${symbol}:`, err);
    }
  }
}

export async function runHistorySyncJob() {
  console.log(`[Market Worker] Rozpoczynanie synchronizacji świec historycznych...`);
  for (const symbol of SYMBOLS_TO_MONITOR) {
    try {
      const candles = await marketService.getHistoricalPrices(symbol, "1d", "1m");
      console.log(`[Market Worker] Zsynchronizowano ${candles.length} świec dla ${symbol}`);
    } catch (err) {
      console.error(`[Market Worker] Błąd synchronizacji historii dla ${symbol}:`, err);
    }
  }
}

// Jeśli uruchomiony bezpośrednio przez node/tsx
if (process.argv[1]?.includes("market-worker")) {
  runQuoteSyncJob().catch(console.error);

  process.on("SIGTERM", () => {
    console.log("[Market Worker] SIGTERM odebrany. Bezpieczne zatrzymywanie...");
    process.exit(0);
  });
}
