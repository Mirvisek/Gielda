#!/usr/bin/env bash
set -e

# ==============================================================================
# AUTOMATYCZNY BACKUP BAZY DANYCH MARIADB Z WYSYŁKĄ POZA VPS
# ==============================================================================
# Zgodnie z punktami 54, 55, 56 specyfikacji.
# Uruchamiany codziennie w cronie (np. 02:00 w nocy).

BACKUP_DIR="/var/backups/market_intelligence"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/market_intelligence_${TIMESTAMP}.sql.gz"
DB_NAME="market_intelligence"
DB_USER="market_user"

# Wczytaj hasło z bezpiecznego pliku konfiguracyjnego lub .my.cnf
# ~/.my.cnf zawiera:
# [client]
# password=TWOJE_HASLO

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "[1/3] Wykonywanie zrzutu bazy MariaDB..."
mysqldump --single-transaction --quick --lock-tables=false \
    -u "${DB_USER}" "${DB_NAME}" | gzip > "${BACKUP_FILE}"

chmod 600 "${BACKUP_FILE}"
echo "Zrzut zapisany w: ${BACKUP_FILE} (Rozmiar: $(du -h "${BACKUP_FILE}" | cut -f1))"

echo "[2/3] Szyfrowanie i wysyłka kopii poza VPS (Off-site storage)..."
# Przykład: rclone do zdalnego zaszyfrowanego magazynu S3 / ProtonDrive / B2 / rsync
if command -v rclone &> /dev/null; then
    rclone copy "${BACKUP_FILE}" remote_backup:market-db-backups/
    echo "Kopia zapasowa przesłana bezpiecznie na zdalny serwer (off-site)."
else
    echo "UWAGA: Zainstaluj i skonfiguruj rclone lub scp, aby wysyłać backup poza serwer VPS!"
fi

echo "[3/3] Czyszczenie lokalnych kopii starszych niż 14 dni..."
find "${BACKUP_DIR}" -type f -name "*.sql.gz" -mtime +14 -delete

echo "Backup zakończony pomyślnie."
