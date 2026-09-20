#!/usr/bin/env bash
set -e

# ==============================================================================
# SKRYPT KONFIGURACJI ZAPORY UFW — VPS HARDENING
# ==============================================================================
# Zgodnie z punktami 25, 26 specyfikacji:
# Publicznie dostępne: 80, 443, SSH (22 lub custom).
# MariaDB (3306) i Redis (6379) ZABLOKOWANE przed światem (wyłącznie localhost).

echo "[1/4] Resetowanie reguł UFW do wartości domyślnych..."
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing

echo "[2/4] Zezwalanie na niezbędne porty..."
# SSH (zmień port na niestandardowy, jeśli używasz innego niż 22)
sudo ufw allow 22/tcp comment 'SSH'

# Web traffic (Nginx)
sudo ufw allow 80/tcp comment 'HTTP Let-s Encrypt'
sudo ufw allow 443/tcp comment 'HTTPS'

echo "[3/4] Włączanie UFW..."
sudo ufw --force enable

echo "[4/4] Status reguł zapory:"
sudo ufw status verbose

echo "UFW skonfigurowane pomyślnie. MariaDB (3306) i Redis (6379) są chronione i odcięte od internetu."
