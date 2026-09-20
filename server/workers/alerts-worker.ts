/**
 * ALERTS WORKER — Ciągła, okresowa ewaluacja alertów rynkowych, AI i portfelowych oraz wysyłka Web Push
 * Uruchamiany przez PM2 w tle lub bezpośrednio: npx tsx server/workers/alerts-worker.ts
 */

import dotenv from "dotenv";
dotenv.config();

import { alertService } from "../../lib/alerts/alert-service";

const INTERVAL_MS = parseInt(process.env.ALERT_EVALUATION_INTERVAL_MS || "120000", 10); // Domyślnie co 2 minuty

async function runAlertCycle() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [AlertsWorker] Rozpoczynanie cyklu ewaluacji alertów...`);

  try {
    const result = await alertService.evaluateAlerts();
    console.log(
      `[${new Date().toISOString()}] [AlertsWorker] Zakończono cykl: sprawdzono ${result.evaluatedCount} alertów, aktywowano ${result.triggeredCount} powiadomień.`
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [AlertsWorker] Błąd podczas ewaluacji alertów:`, error);
  }
}

async function start() {
  console.log(`[AlertsWorker] Uruchomiono worker alertów (interwał: ${INTERVAL_MS / 1000}s).`);

  // Pierwsza ewaluacja po uruchomieniu
  await runAlertCycle();

  // Cykliczne sprawdzanie
  const timer = setInterval(runAlertCycle, INTERVAL_MS);

  const shutdown = () => {
    console.log("[AlertsWorker] Zatrzymywanie workera alertów...");
    clearInterval(timer);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error("[AlertsWorker Fatal Error]:", err);
  process.exit(1);
});
