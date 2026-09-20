#!/usr/bin/env bash
set -e

# ==============================================================================
# AUTOMATED VPS PROVISIONING SCRIPT — BARE-METAL (DEBIAN 12 / UBUNTU 24.04 LTS)
# ==============================================================================
# Uruchomienie na czystym serwerze z uprawnieniami roota:
# sudo bash deploy/setup-vps.sh

if [ "$EUID" -ne 0 ]; then
  echo "BŁĄD: Ten skrypt musi zostać uruchomiony z uprawnieniami roota (sudo)!"
  exit 1
fi

echo "============================================================"
echo "    INSTALACJA I HARDENING VPS (BEZ DOCKERA / BARE-METAL)   "
echo "============================================================"

# 1. Aktualizacja repozytoriów i systemu
echo "[1/9] Aktualizacja pakietów systemowych..."
apt update && apt upgrade -y

# 2. Narzędzia bazowe i serwisy
echo "[2/9] Instalacja pakietów: Nginx, MariaDB, Redis, UFW, Fail2ban, Certbot..."
apt install -y \
  curl \
  git \
  ufw \
  fail2ban \
  nginx \
  mariadb-server \
  redis-server \
  certbot \
  python3-certbot-nginx \
  build-essential \
  logrotate \
  unzip

# 3. Instalacja Node.js 22 LTS i PM2
echo "[3/9] Konfiguracja repozytorium NodeSource i instalacja Node.js 22 LTS..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
fi

echo "Wersja Node.js: $(node -v)"
echo "Wersja npm: $(npm -v)"

echo "Instalacja PM2 i modułu rotacji logów..."
npm install -g pm2
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true

# 4. Zabezpieczenie MariaDB (nasłuch wyłącznie na localhost)
echo "[4/9] Zabezpieczanie MariaDB (izolacja localhost 127.0.0.1)..."
MARIADB_CNF="/etc/mysql/mariadb.conf.d/50-server.cnf"
if [ -f "$MARIADB_CNF" ]; then
  sed -i 's/^bind-address.*/bind-address = 127.0.0.1/' "$MARIADB_CNF"
fi
systemctl restart mariadb
systemctl enable mariadb

# 5. Zabezpieczenie Redis (nasłuch wyłącznie na localhost, protected-mode)
echo "[5/9] Zabezpieczanie Redis (izolacja localhost 127.0.0.1)..."
REDIS_CNF="/etc/redis/redis.conf"
if [ -f "$REDIS_CNF" ]; then
  sed -i 's/^bind .*/bind 127.0.0.1 ::1/' "$REDIS_CNF"
  sed -i 's/^protected-mode no/protected-mode yes/' "$REDIS_CNF"
fi
systemctl restart redis-server
systemctl enable redis-server

# 6. Konfiguracja zapory UFW
echo "[6/9] Konfiguracja reguł zapory ogniowej UFW..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP Let-s Encrypt'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable
ufw status verbose

# 7. Konfiguracja ochrony przed intruzami Fail2ban
echo "[7/9] Konfiguracja Fail2ban..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/fail2ban/jail.local" ]; then
  cp "$SCRIPT_DIR/fail2ban/jail.local" /etc/fail2ban/jail.local
fi
systemctl restart fail2ban
systemctl enable fail2ban

# 8. Przygotowanie katalogów aplikacji i backupów
echo "[8/9] Tworzenie struktury katalogów i uprawnień..."
mkdir -p /var/www/market-intelligence
mkdir -p /var/backups/market_intelligence
chmod 700 /var/backups/market_intelligence

# 9. Konfiguracja cyklicznych zadań w crontab
echo "[9/9] Konfiguracja harmonogramu zadań cron (backup bazy o 02:00 w nocy)..."
CRON_JOB="0 2 * * * /var/www/market-intelligence/deploy/backup/backup-mariadb.sh >> /var/log/market-backup.log 2>&1"
(crontab -l 2>/dev/null | grep -v "backup-mariadb.sh" ; echo "$CRON_JOB") | crontab -

echo ""
echo "============================================================"
echo "    VPS BARE-METAL PROVISIONING ZAKOŃCZONY POMYŚLNIE!       "
echo "============================================================"
echo "Kolejne kroki:"
echo "1. Utwórz bazę w MariaDB:"
echo "   sudo mysql -e \"CREATE DATABASE market_intelligence CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\""
echo "   sudo mysql -e \"CREATE USER 'market_user'@'localhost' IDENTIFIED BY 'SILNE_HASLO';\""
echo "   sudo mysql -e \"GRANT ALL PRIVILEGES ON market_intelligence.* TO 'market_user'@'localhost'; FLUSH PRIVILEGES;\""
echo ""
echo "2. Skonfiguruj Nginx dla swojej domeny:"
echo "   sudo cp /var/www/market-intelligence/deploy/nginx/app.conf /etc/nginx/sites-available/app.twojadomena.pl"
echo "   (edytuj server_name w pliku)"
echo "   sudo ln -s /etc/nginx/sites-available/app.twojadomena.pl /etc/nginx/sites-enabled/"
echo "   sudo certbot --nginx -d app.twojadomena.pl"
echo "   sudo systemctl reload nginx"
echo ""
echo "3. Uzupełnij /var/www/market-intelligence/.env i uruchom: ./deploy/deploy.sh"
