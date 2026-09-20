# Zasady Bezpieczeństwa (Security Policy)

## 1. Zero Public Registration
- Brak jakichkolwiek publicznych formularzy „Zarejestruj się”.
- Konta mogą być tworzone wyłącznie przez Administratora.
- Próby logowania z nieistniejących lub nieaktywnych kont kończą się ogólnym komunikatem `Access Denied`, bez ujawniania istnienia adresu email w bazie (ochrona przed User Enumeration).

## 2. Model Autoryzacji Dostawców
Rozdzielenie trzech warstw:
1. **Konto istnieje i jest w statusie `ACTIVE`**.
2. **Administrator przypisał użytkownikowi dozwoloną metodę logowania** (`allowed_auth_methods`: `PASSWORD`, `PASSKEY`, `GOOGLE`, `APPLE`, `FACEBOOK`).
3. **Provider jest powiązany z kontem** (`oauth_accounts`, `passkeys`).

Nawet jeśli zewnętrzny dostawca OAuth (Google, Apple) zwróci adres email zgodny z użytkownikiem w bazie, logowanie zostaje zablokowane, jeśli provider nie został uprzednio powiązany przez zalogowanego użytkownika (po re-autentykacji) oraz jeśli administrator nie zezwolił na daną metodę logowania dla tego konta.

## 3. WebAuthn / Passkeys
- Główna metoda szybkiego logowania biometrycznego (Face ID, Touch ID, Windows Hello).
- Rejestracja nowego Passkey wymaga uprzedniego zalogowania i ponownej weryfikacji tożsamości (re-authentication).
- Procedura awaryjna: jednorazowe kody recovery (Argon2id/SHA-256 hash) oraz wsparcie administratora.

## 4. Zarządzanie Sesjami
- Token sesyjny generowany losowo z 32 bajtów entropii (`crypto.randomBytes(32)`).
- W bazie MariaDB zapisywany jest wyłącznie skrót SHA-256 (`session_hash`).
- Ciasteczka sesyjne z flagami: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- Administrator ma możliwość natychmiastowego unieważnienia dowolnej sesji lub wszystkich sesji użytkownika.

## 5. Logowanie Zdarzeń Bezpieczeństwa
Każda próba logowania, zmiana hasła, dodanie Passkey, zmiana uprawnień lub błąd autoryzacji jest rejestrowana w tabeli `security_events` oraz `audit_logs` (z bezwzględnym zakazem logowania haseł, tokenów i kluczy API).
