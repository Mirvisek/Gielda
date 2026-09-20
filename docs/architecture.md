# Architektura Systemu Market Intelligence

## 1. Przegląd

Market Intelligence to prywatne centrum analityczne oparte na Next.js 15, TypeScript, MariaDB, Redis i modelach AI.

Kluczowe założenie:
> Nie obiecujemy, że „AI wie, co jutro wzrośnie”.
> Budujemy system, który zbiera dane z wielu źródeł, wykrywa zależności, generuje mierzalne sygnały (Opportunity, Risk, Confidence) i rejestruje je w niezmiennym dzienniku predykcji podlegającym weryfikacji historycznej (Backtesting).

## 2. Warstwy Architektury

```
INTERNET
   │
   ▼ (DNS / Cloudflare)
NGINX (:443 HTTPS / TLS 1.3)
   │
   ▼ (localhost:3000)
NEXT.JS 15 (App Router)
   ├── Web UI (Mobile-First, PWA, Standalone)
   ├── REST / Action APIs
   └── Security Middleware (Zero Public Registration, Rate Limiting)
   │
   ├── MariaDB 11.4 (Baza danych, 22 tabele, relacje, indeksy)
   └── Redis 7 (Cache notowań, kolejki zadań, blokady rate-limit)

PROCESY TŁA (PM2)
   ├── market-web: Instancje klastra Next.js
   ├── market-worker: Zadania asynchroniczne (pobieranie danych, wyliczanie wskaźników, AI scoring)
   └── market-scheduler: Cron harmonogramu (interwały 5 min, 10 min, raporty dzienne)
```

## 3. Warstwy Adapterów

### MarketDataProvider
```
MarketDataProvider (Interface)
├── YahooFinanceProvider (Domyślny dla developmentu)
├── FMPProvider
├── AlphaVantageProvider
└── PolygonProvider
```

### AIProvider
```
AIProvider (Interface)
├── OpenAIProvider (Domyślny)
├── GeminiProvider
└── ClaudeProvider
```

## 4. Ochrona przed Prompt Injection
Treści pobrane z internetu (artykuły, tweety, fora) są bezwzględnie oznaczane jako `UNTRUSTED_EXTERNAL_DATA` i poddawane sanityzacji przed przekazaniem do modeli LLM. Model AI działa w trybie analitycznym (`ANALYZE`, `CLASSIFY`, `SUMMARIZE`, `SCORE`) i nie posiada uprawnień do wykonywania komend shell ani bezpośrednich zapytań SQL.
