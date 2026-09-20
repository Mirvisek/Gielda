# Kompletna Instrukcja Wdrożenia Produkcyjnego na VPS (Bare-Metal / Bez Dockera)

Niniejsza dokumentacja opisuje wdrożenie platformy **Market Intelligence** na serwerze dedykowanym lub VPS (Debian 12 / Ubuntu 24.04 LTS) w architekturze **natywnej (Bare-Metal)**.

---

## 1. Wymagania Serwera i Przygotowanie

### Rekomendowane Parametry VPS:
- **System operacyjny:** Debian 12 (Bookworm) lub Ubuntu 24.04 LTS
- **Zasoby sprzętowe:** min. 2 vCPU, 4 GB RAM, 40 GB NVMe / SSD
- **Dostęp:** SSH z kluczem kryptograficznym (ed25519 / RSA)
- **Domena:** Skierowane rekordy DNS typu A (`app.twojadomena.pl` -> IP serwera)

### Tworzenie Użytkownika Wdrożeniowego (Opcjonalne, zalecane):
```bash
# Zaloguj się jako root i utwórz użytkownika deploy
adduser deploy
usermod -aG sudo deploy

# Skopiuj autoryzowany klucz SSH
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

---

## 2. Krok 1: Automatyczny Provisioning Serwera (`setup-vps.sh`)

Zaloguj się na serwer VPS i pobierz skrypt provisioningowy:

```bash
# 1. Klonowanie repozytorium do katalogu produkcyjnego
sudo mkdir -p /var/www/market-intelligence
sudo chown -R $USER:$USER /var/www/market-intelligence
git clone https://github.com/Mirvisek/Gielda.git /var/www/market-intelligence
cd /var/www/market-intelligence

# 2. Uruchomienie zautomatyzowanego skryptu konfiguracji
sudo bash deploy/setup-vps.sh
```

Skrypt ten automatycznie:
- Aktualizuje pakiety systemowe,
- Instaluje **Nginx**, **MariaDB**, **Redis**, **Certbot**, **UFW**, **Fail2ban**, **Node.js 22 LTS**,
- Instaluje globalnie **PM2** wraz z modułem `pm2-logrotate`,
- Konfiguruje zaporę **UFW** (blokując dostęp z zewnątrz do portów 3306 i 6379),
- Konfiguruje reguły **Fail2ban** (ochrona SSH i serwera HTTP przed brute-force),
- Tworzy katalogi aplikacji i harmonogram automatycznych kopii zapasowych w cronie (`02:00` w nocy).

---

## 3. Krok 2: Konfiguracja Bazy Danych MariaDB

Zaloguj się do powłoki bazy danych:
```bash
sudo mysql
```

Wykonaj polecenia tworzące bazę i dedykowanego użytkownika:
```sql
CREATE DATABASE market_intelligence CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'market_user'@'localhost' IDENTIFIED BY 'WPROWADZ_TUTAJ_BARDZO_SILNE_HASLO';

GRANT ALL PRIVILEGES ON market_intelligence.* TO 'market_user'@'localhost';

FLUSH PRIVILEGES;
EXIT;
```

---

## 4. Krok 3: Konfiguracja Zmiennych Środowiskowych (`.env`)

W katalogu `/var/www/market-intelligence`:
```bash
cp .env.production.example .env
nano .env
```

Uzupełnij kluczowe zmienne:
1. `DATABASE_URL="mysql://market_user:WPROWADZ_TUTAJ_BARDZO_SILNE_HASLO@127.0.0.1:3306/market_intelligence"`
2. `APP_URL="https://app.twojadomena.pl"`
3. `AUTH_SECRET`: wygeneruj losowy klucz poleceniem `openssl rand -base64 32`
4. `WEBAUTHN_RP_ID="twojadomena.pl"` oraz `WEBAUTHN_ORIGIN="https://app.twojadomena.pl"`
5. Klucze VAPID (Web Push):
   ```bash
   npx web-push generate-vapid-keys
   ```
   Wklej wygenerowany `Public Key` do `VAPID_PUBLIC_KEY` oraz `Private Key` do `VAPID_PRIVATE_KEY`.
6. Klucze dostawców AI (`GEMINI_API_KEY`, `OPENAI_API_KEY` lub `ANTHROPIC_API_KEY`).

Zabezpiecz uprawnienia do pliku `.env`:
```bash
chmod 600 .env
```

---

## 5. Krok 4: Pierwsza Budowa i Uruchomienie Procesów PM2

```bash
cd /var/www/market-intelligence

# 1. Instalacja zależności produkcyjnych
npm ci

# 2. Synchronizacja schematu bazy danych
npx prisma generate
npx prisma db push

# 3. Kompilacja aplikacji Next.js
npm run build

# 4. Uruchomienie klastra i workerów PM2
pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp /home/$USER
```

### Nadzorowane Procesy PM2:
- `market-web` — Aplikacja Next.js w trybie klastrowym (`exec_mode: cluster`, port 3000),
- `market-worker` — Pobieranie i aktualizacja notowań giełdowych,
- `news-worker` — Monitoring i analiza sentymentu newsów,
- `prediction-worker` — Ewaluacja dojrzałych prognoz (+1d, +7d, +30d, +90d),
- `alerts-worker` — Ciągła ewaluacja alertów rynkowych, AI i portfelowych + wysyłka Web Push,
- `market-scheduler` — Harmonogram zadań cyklicznych.

---

## 6. Krok 5: Konfiguracja Nginx i Certyfikat SSL (Let's Encrypt)

Certbot wymaga, aby konfiguracja Nginxa przeszła walidację `nginx -t` przed wystawieniem certyfikatu (odwołania do nieistniejących jeszcze plików `.pem` spowodowałyby błąd).

```bash
# 1. Wstępna konfiguracja HTTP (umożliwiająca walidację ACME przez Certbot):
sudo tee /etc/nginx/sites-available/app.twojadomena.pl > /dev/null << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name app.twojadomena.pl;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 2. Włącz konfigurację witryny linkiem symbolicznym:
sudo ln -s /etc/nginx/sites-available/app.twojadomena.pl /etc/nginx/sites-enabled/

# 3. Wygeneruj bezpłatny certyfikat SSL z Let's Encrypt:
sudo certbot --nginx -d app.twojadomena.pl

# 4. Wgraj docelową, pełną konfigurację z nagłówkami bezpieczeństwa i PWA:
sudo cp /var/www/market-intelligence/deploy/nginx/app.conf /etc/nginx/sites-available/app.twojadomena.pl
sudo sed -i 's/app.twojadomena.pl/twoja-rzeczywista-domena.pl/g' /etc/nginx/sites-available/app.twojadomena.pl

# 5. Przetestuj i przeładuj Nginx:
sudo nginx -t
sudo systemctl reload nginx
```

---

## 7. Krok 6: Monitorowanie i Samonaprawa (Watchdog)

W celu zapewnienia 100% dostępności dodaj skrypt `healthcheck.sh` do systemowego crona:
```bash
crontab -e
```
Dodaj wpis uruchamiający test zdrowia co 5 minut:
```cron
*/5 * * * * /var/www/market-intelligence/deploy/healthcheck.sh >> /var/log/market-watchdog.log 2>&1
```

Skrypt automatycznie monitoruje `mariadb`, `redis-server`, `nginx` oraz odpowiedź `http://127.0.0.1:3000/api/health`. W razie wykrycia przestoju automatycznie przeładowuje procesy.

---

## 8. Procedura Aktualizacji Aplikacji (Zero-Downtime Deployment)

Gdy na repozytorium `main` pojawią się nowe zmiany, wdrożenie nowej wersji na serwerze sprowadza się do **jednego polecenia**:

```bash
cd /var/www/market-intelligence
./deploy/deploy.sh
```

Skrypt automatycznie pobiera kod, aktualizuje schemat Prisma, kompiluje aplikację produkcyjną, wykonuje `pm2 reload` bez przerywania obsługi ruchu i weryfikuje status endpointu `/api/health`.

---

## 9. Podsumowanie Komend Zarządzania

```bash
# Podgląd statusu procesów
pm2 status

# Podgląd logów na żywo
pm2 logs
pm2 logs alerts-worker
pm2 logs market-web

# Restart aplikacji
pm2 reload ecosystem.config.js

# Sprawdzenie stanu zapory sieciowej
sudo ufw status verbose

# Sprawdzenie zablokowanych adresów IP (Fail2ban)
sudo fail2ban-client status sshd

# Ręczne wykonanie kopii zapasowej bazy danych
sudo /var/www/market-intelligence/deploy/backup/backup-mariadb.sh
```
