# Schemat Bazy Danych (MariaDB 11.4 / Prisma)

Baza danych zawiera 22 tabele zoptymalizowane pod kątem wydajności i bezpieczeństwa:

## Tabele Bezpieczeństwa i Użytkowników
1. `users` — konta użytkowników, statusy (`INVITED`, `ACTIVE`, `SUSPENDED`, `LOCKED`, `DISABLED`, `DELETED`), role (`ADMIN`, `USER`).
2. `user_auth_methods` — dozwolone metody logowania per konto (`PASSWORD`, `GOOGLE`, `APPLE`, `FACEBOOK`, `PASSKEY`).
3. `passkeys` — poświadczenia WebAuthn (credential_id, public_key, counter, device_type).
4. `oauth_accounts` — powiązania z dostawcami zewnętrznymi (Google, Apple, Facebook).
5. `sessions` — aktywne sesje (session_hash SHA-256, expires_at, revoked_at).
6. `recovery_codes` — jednorazowe kody awaryjne (code_hash).
7. `security_events` — rejestr zdarzeń uwierzytelniania i audytu bezpieczeństwa.
8. `audit_logs` — rejestr operacji administracyjnych (kto, co, na czym, kiedy).

## Tabele Danych Rynkowych i Fundamentalnych
9. `assets` — katalog śledzonych aktywów (akcje, ETF, surowce, krypto, indeksy).
10. `prices` — notowania historyczne (OHLCV, indeks złożony: asset_id + timestamp).
11. `fundamentals` — wskaźniki fundamentalne (EPS, FCF, P/E, EV/EBITDA, ROIC, ROE).

## Tabele Wiadomości i Geopolityki
12. `news` — znormalizowane wiadomości z deduplikacją (content_hash) i źródłem (tier).
13. `events` — wydarzenia makroekonomiczne i geopolityczne (kraj, aktor, konsekwencje).
14. `event_assets` — powiązania wydarzeń z konkretnymi aktywami i estymacja wpływu.

## Tabele Sygnałów i Prediction Journal
15. `signals` — wygenerowane sygnały ze scoringiem (Opportunity 0-100, Risk 0-100, Confidence 0-100).
16. `signal_factors` — czynniki składowe sygnału (techniczne, fundamentalne, makro, geopolityczne, newsy).
17. `predictions` — **niezmienny (immutable)** rejestr predykcji rynkowych.
18. `prediction_results` — ewaluacja predykcji po 1d, 7d, 30d, 90d (weryfikacja historyczna).

## Tabele Portfela, Watchlisty i Alertów
19. `portfolio` — portfele inwestycyjne użytkowników.
20. `portfolio_positions` — pozycje w portfelu (wolumen, średnia cena zakupu, P/L).
21. `watchlists` — listy obserwowanych aktywów.
22. `alerts` — alerty cenowe, wolumenowe, scoringowe i geopolityczne.
