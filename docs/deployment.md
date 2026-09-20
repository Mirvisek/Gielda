# Procedura Wdrożenia na VPS (Debian / Ubuntu)

## 1. Wymagania Wstępne na VPS
- Świeży system Debian 12 / Ubuntu 24.04 LTS
- Użytkownik `deploy` z uprawnieniami sudo i dostępem wyłącznie przez klucz SSH
- Porty: 80, 443, SSH (dowolny zdefiniowany port)

## 2. Kolejność Konfiguracji VPS

### Krok 1: Aktualizacja systemu i pakiety bazowe
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ufw fail2ban curl git nginx mariadb-server redis-server
```

### Krok 2: Konfiguracja Zapory UFW
```bash
chmod +x deploy/ufw/setup-firewall.sh
sudo ./deploy/ufw/setup-firewall.sh
```

### Krok 3: Konfiguracja MariaDB i Redis
- MariaDB i Redis nasłuchują wyłącznie na `127.0.0.1`
- Utwórz bazę i dedykowanego użytkownika z uprawnieniami `SELECT, INSERT, UPDATE, DELETE`:
```sql
CREATE DATABASE market_intelligence CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'market_user'@'localhost' IDENTIFIED BY 'SILNE_LOSOWE_HASLO';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON market_intelligence.* TO 'market_user'@'localhost';
FLUSH PRIVILEGES;
```

### Krok 4: Instalacja Node.js (v24 LTS) i PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
pm2 install pm2-logrotate
```

### Krok 5: Klonowanie repozytorium i budowa
```bash
git clone <repo-url> /var/www/market-intelligence
cd /var/www/market-intelligence
npm ci
cp .env.example .env # i uzupełnij sekrety produkcyjne
npm run db:generate
npm run build
```

### Krok 6: Uruchomienie procesów przez PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Krok 7: Nginx i Let's Encrypt SSL
```bash
sudo cp deploy/nginx/app.conf /etc/nginx/sites-available/app.twojadomena.pl
# Zmień domenę w pliku konfiguracyjnym
sudo ln -s /etc/nginx/sites-available/app.twojadomena.pl /etc/nginx/sites-enabled/
sudo certbot --nginx -d app.twojadomena.pl
sudo systemctl reload nginx
```
