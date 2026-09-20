#!/usr/bin/env bash
set -e

# ==============================================================================
# ZERO-DOWNTIME PRODUCTION DEPLOYMENT SCRIPT — BARE-METAL VPS
# ==============================================================================
# Uruchamiany po każdym wdrożeniu nowej wersji: ./deploy/deploy.sh

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

echo "------------------------------------------------------------"
echo "[$TIMESTAMP] Rozpoczynanie procedury wdrożenia produkcyjnego"
echo "Lokalizacja: $APP_DIR"
echo "------------------------------------------------------------"

cd "$APP_DIR" || { echo "BŁĄD: Nie można wejść do katalogu $APP_DIR!"; exit 1; }

echo "[1/6] Pobieranie najnowszych zmian z repozytorium (git pull)..."
git fetch origin main
git reset --hard origin/main

echo "[2/6] Sprawdzanie i instalacja zależności produkcyjnych (npm ci)..."
npm ci --prefer-offline --no-audit

echo "[3/6] Synchronizacja schematu bazy danych Prisma..."
npx prisma generate
npx prisma db push --skip-generate

echo "[4/6] Budowanie zoptymalizowanej paczki produkcyjnej Next.js..."
npm run build

echo "[5/6] Przeładowanie procesów PM2 w trybie zero-downtime..."
pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
pm2 save

echo "[6/6] Weryfikacja zdrowia aplikacji (Healthcheck)..."
sleep 3
APP_PORT=$(grep -E '^PORT=' .env 2>/dev/null | cut -d '=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ' || echo 3005)
APP_PORT=${APP_PORT:-3005}
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${APP_PORT}/api/health" || echo "FAILED")

if [ "$HEALTH_STATUS" = "200" ]; then
    echo "============================================================"
    echo "[$TIMESTAMP] Wdrożenie zakończone SUKCESEM! (Status: HTTP 200)"
    echo "============================================================"
    pm2 status
else
    echo "============================================================"
    echo "OSTRZEŻENIE: Healthcheck zwrócił status: $HEALTH_STATUS"
    echo "Sprawdź logi aplikacji: pm2 logs"
    echo "============================================================"
    exit 1
fi
