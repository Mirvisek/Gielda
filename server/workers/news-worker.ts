/**
 * NEWS WORKER — Pobiera feedy i przetwarza oczekujące artykuły przez modele AI
 * Uruchamiany przez PM2 lub bezpośrednio: npx tsx server/workers/news-worker.ts
 */

import dotenv from "dotenv";
dotenv.config();

import { newsService } from "../../lib/news/news-service";

const INTERVAL_MS = 15 * 60 * 1000; // Co 15 minut

async function runNewsCycle() {
  console.log(`[${new Date().toISOString()}] [NewsWorker] Rozpoczynanie cyklu pobierania i analizy...`);

  try {
    // 1. Pobierz aktywne źródła
    const ingestRes = await newsService.ingestAllActiveSources();
    console.log(
      `[NewsWorker] Ingest zakończony: +${ingestRes.totalAdded} nowych, ${ingestRes.totalSkipped} duplikatów, ${ingestRes.totalFlagged} oflagowanych przez tarczę.`
    );

    // 2. Przetwórz oczekujące artykuły AI (maksymalnie 5 na partię, aby nie przeciążyć API)
    const aiRes = await newsService.processPendingNewsBatch(5);
    console.log(
      `[NewsWorker] Analiza AI zakończona: ${aiRes.processed} przetworzonych, ${aiRes.errors} błędów.`
    );
  } catch (error) {
    console.error("[NewsWorker] Błąd podczas cyklu pracy:", error);
  }
}

async function start() {
  console.log("[NewsWorker] Uruchomiono worker wiadomości (interwał: 15 min).");

  // Pierwsze wykonanie od razu po starcie
  await runNewsCycle();

  // Kolejne cykle w interwale
  const timer = setInterval(runNewsCycle, INTERVAL_MS);

  const shutdown = () => {
    console.log("[NewsWorker] Zatrzymywanie workera...");
    clearInterval(timer);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Uruchomienie workera jeśli wywołany bezpośrednio
start().catch((err) => {
  console.error("[NewsWorker Fatal Error]:", err);
  process.exit(1);
});
