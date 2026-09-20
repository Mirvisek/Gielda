/**
 * Market Scheduler - Opcjonalny proces harmonogramu
 */

console.log("[Scheduler] Market scheduler initialized.");

const timer = setInterval(() => {
  console.log(`[${new Date().toISOString()}] [Scheduler] Heartbeat OK.`);
}, 60 * 60 * 1000);

process.on("SIGTERM", () => {
  console.log("[Scheduler] SIGTERM received. Shutting down gracefully...");
  clearInterval(timer);
  process.exit(0);
});
