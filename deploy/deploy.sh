#!/usr/bin/env bash
set -e

# ==============================================================================
# ZERO-DOWNTIME PRODUCTION DEPLOYMENT SCRIPT — BARE-METAL VPS
# ==============================================================================
# Uruchamiany po każdym wdrożeniu nowej wersji: ./deploy/deploy.sh

APP_DIR="/var/www/market-intelligence"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

echo "------------------------------------------------------------"
echo "[$TIMESTAMP] Rozpoczynanie procedury wdrożenia produkcyjnego"
echo "------------------------------------------------------------"

cd "$APP_DIR" || { echo "BŁĄD: Katalog $APP_DIR nie istnieje!"; exit 1; }

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
pm2 reload ecosystem.config.js --update-env
pm2 save

echo "[6/6] Weryfikacja zdrowia aplikacji (Healthcheck)..."
sleep 3
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health || echo "FAILED")

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
