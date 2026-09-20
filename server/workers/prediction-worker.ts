/**
 * PREDICTION WORKER — Okresowa ewaluacja dojrzałych prognoz (+1d, +7d, +30d, +90d)
 * Uruchamiany przez PM2 lub bezpośrednio: npx tsx server/workers/prediction-worker.ts
 */

import dotenv from "dotenv";
dotenv.config();

import { predictionService } from "../../lib/scoring/prediction-service";

const INTERVAL_MS = 60 * 60 * 1000; // Co godzinę

async function runPredictionCycle() {
  console.log(`[${new Date().toISOString()}] [PredictionWorker] Sprawdzanie dojrzałych prognoz do ewaluacji...`);

  try {
    const result = await predictionService.evaluateMaturedPredictions();
    console.log(
      `[PredictionWorker] Cykl zakończony: zaktualizowano ${result.evaluatedCount} prognoz.`
    );
  } catch (error) {
    console.error("[PredictionWorker] Błąd podczas ewaluacji prognoz:", error);
  }
}

async function start() {
  console.log("[PredictionWorker] Uruchomiono worker dziennika prognoz (interwał: 1h).");

  // Pierwsze wykonanie od razu po starcie
  await runPredictionCycle();

  // Kolejne cykle w interwale
  const timer = setInterval(runPredictionCycle, INTERVAL_MS);

  const shutdown = () => {
    console.log("[PredictionWorker] Zatrzymywanie workera...");
    clearInterval(timer);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Uruchomienie workera jeśli wywołany bezpośrednio
start().catch((err) => {
  console.error("[PredictionWorker Fatal Error]:", err);
  process.exit(1);
});
