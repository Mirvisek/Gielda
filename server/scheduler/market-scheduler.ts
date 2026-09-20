/**
 * Market Scheduler - Harmonogram zadań okresowych (pobieranie notowań, newsów, raport dzienny).
 * Zarządzany przez PM2 na produkcji.
 */
console.log("[Scheduler] Market scheduler initialized.");

process.on("SIGTERM", () => {
  console.log("[Scheduler] SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});
