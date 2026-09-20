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

# 2. Sprawdzenie endpointu aplikacji Next.js
HTTP_CODE=$(curl -s -m 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health || echo "ERR")

if [ "$HTTP_CODE" != "200" ]; then
  log "AWARIA: Endpoint /api/health zwrócił kod: $HTTP_CODE! Restart procesów PM2..."
  cd /var/www/market-intelligence && pm2 reload ecosystem.config.js --update-env
else
  # Opcjonalnie: log cichy, tylko w razie awarii
  :
fi
