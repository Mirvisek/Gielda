/**
 * Market Worker - Asynchroniczny proces przetwarzania danych, newsów i scoringu AI.
 * Zarządzany przez PM2 na produkcji.
 */
console.log("[Worker] Market intelligence background worker initialized.");

process.on("SIGTERM", () => {
  console.log("[Worker] SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});
