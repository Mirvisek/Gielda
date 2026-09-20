#!/usr/bin/env bash
# ==============================================================================
# PRODUCTION HEALTHCHECK & WATCHDOG SCRIPT — BARE-METAL VPS
# ==============================================================================
# Uruchamiany w cronie co 5 minut:
# */5 * * * * /var/www/market-intelligence/deploy/healthcheck.sh >> /var/log/market-watchdog.log 2>&1

LOG_FILE="/var/log/market-watchdog.log"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

log() {
  echo "[$TIMESTAMP] $1"
}

# 1. Sprawdzenie statusu systemd dla usług systemowych
for SERVICE in mariadb redis-server nginx; do
  if ! systemctl is-active --quiet "$SERVICE"; then
    log "AWARIA: Usługa $SERVICE nie działa! Próba restartu..."
    systemctl restart "$SERVICE"
  fi
done

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PORT=$(grep -E '^PORT=' "${APP_DIR}/.env" 2>/dev/null | cut -d '=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ' || echo 3000)
APP_PORT=${APP_PORT:-3000}

# 2. Sprawdzenie endpointu aplikacji Next.js
HTTP_CODE=$(curl -s -m 5 -o /dev/null -w "%{http_code}" "http://127.0.0.1:${APP_PORT}/api/health" || echo "ERR")

if [ "$HTTP_CODE" != "200" ]; then
  log "AWARIA: Endpoint /api/health zwrócił kod: $HTTP_CODE! Restart procesów PM2..."
  cd "$APP_DIR" && pm2 reload ecosystem.config.js --update-env
else
  # Cicho jeśli wszystko działa
  :
fi
