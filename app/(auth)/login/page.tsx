"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { Shield, KeyRound, Lock, AlertCircle, ArrowRight, Smartphone } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<"GOOGLE" | "APPLE" | "FACEBOOK" | null>(null);
  const [oauthAccountId, setOauthAccountId] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 3. Logowanie powiązanym kontem OAuth
  const handleOAuthLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oauthProvider || !oauthAccountId.trim()) return;

    setOauthLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: oauthProvider,
          providerAccountId: oauthAccountId.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Nie udało się zalogować za pomocą konta OAuth.");
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Błąd autoryzacji OAuth";
      setErrorMessage(msg);
    } finally {
      setOauthLoading(false);
    }
  };

  // 1. Logowanie za pomocą Passkey (WebAuthn / Biometria / PIN)
  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true);
    setErrorMessage(null);

    try {
      // Pobierz opcje uwierzytelnienia z serwera
      const optRes = await fetch("/api/auth/passkey/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!optRes.ok) {
        const data = await optRes.json();
        throw new Error(data.error || "Błąd pobierania opcji Passkey");
      }

      const { options, challengeKey } = await optRes.json();

      // Wywołaj okno biometrii / klucza sprzętowego w przeglądarce
      const authResponse = await startAuthentication({ optionsJSON: options });

      // Zweryfikuj odpowiedź po stronie serwera
      const verifyRes = await fetch("/api/auth/passkey/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeKey,
          response: authResponse,
        }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || "Nieprawidłowe poświadczenia lub brak dostępu.");
      }

      // Udane logowanie -> przekierowanie do dashboardu
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Błąd autoryzacji Passkey";
      // Jeśli użytkownik anulował okno dialogowe, nie wyświetlaj błędu jako awarii
      if (!msg.includes("abort") && !msg.includes("cancel")) {
        setErrorMessage(msg);
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  // 2. Logowanie klasycznym hasłem (metoda awaryjna)
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Nieprawidłowe poświadczenia lub brak dostępu.");
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Błąd logowania";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
        {/* Nagłówek */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 mb-3">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-wider uppercase text-slate-100">
            Market Intelligence
          </h1>
          <p className="text-xs text-slate-400 mt-1">Prywatne Centrum Analityczne</p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Główna metoda: Passkey */}
        <div className="mb-6">
          <button
            type="button"
            onClick={handlePasskeyLogin}
            disabled={passkeyLoading || loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-600/20 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            <KeyRound className="w-5 h-5" />
            <span>
              {passkeyLoading ? "Oczekiwanie na biometrię..." : "Zaloguj kluczem dostępu"}
            </span>
          </button>
          <p className="text-center text-[11px] text-slate-500 mt-2">
            Face ID / Touch ID / Windows Hello / YubiKey
          </p>
        </div>

        {/* Logowanie zewnętrzne OAuth (powiązane konta) */}
        <div className="mb-6">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setOauthProvider(oauthProvider === "GOOGLE" ? null : "GOOGLE");
                setOauthAccountId("");
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                oauthProvider === "GOOGLE"
                  ? "border-blue-500 bg-blue-950/40 text-blue-300"
                  : "border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 text-slate-300"
              }`}
            >
              <svg className="w-3.5 h-3.5 text-red-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
              </svg>
              <span>Google</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOauthProvider(oauthProvider === "APPLE" ? null : "APPLE");
                setOauthAccountId("");
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                oauthProvider === "APPLE"
                  ? "border-slate-400 bg-slate-800/60 text-white"
                  : "border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 text-slate-300"
              }`}
            >
              <svg className="w-3.5 h-3.5 text-slate-200 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 0.92-2.85-.9.04-2 .6-2.65 1.35-.58.66-1.09 1.73-.96 2.76 1.01.08 2.08-.51 2.69-1.26z" />
              </svg>
              <span>Apple ID</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOauthProvider(oauthProvider === "FACEBOOK" ? null : "FACEBOOK");
                setOauthAccountId("");
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                oauthProvider === "FACEBOOK"
                  ? "border-blue-600 bg-blue-950/60 text-blue-200"
                  : "border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 text-slate-300"
              }`}
            >
              <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span>Facebook</span>
            </button>
          </div>

          {/* Formularz logowania dla wybranego dostawcy OAuth */}
          {oauthProvider && (
            <form onSubmit={handleOAuthLogin} className="mt-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5 animate-in fade-in">
              <div className="text-[11px] text-slate-300 font-medium">
                Zaloguj za pomocą powiązanego konta {oauthProvider === "GOOGLE" ? "Google" : oauthProvider === "APPLE" ? "Apple ID" : "Facebook"}:
              </div>
              <input
                type="text"
                required
                value={oauthAccountId}
                onChange={(e) => setOauthAccountId(e.target.value)}
                placeholder={
                  oauthProvider === "GOOGLE"
                    ? "twoj.login@gmail.com"
                    : oauthProvider === "APPLE"
                    ? "twoj.appleid@icloud.com"
                    : "ID profilu lub email Facebook"
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={oauthLoading || !oauthAccountId.trim()}
                  className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {oauthLoading ? "Weryfikacja..." : `Zaloguj przez ${oauthProvider}`}
                </button>
                <button
                  type="button"
                  onClick={() => setOauthProvider(null)}
                  className="py-2 px-3 rounded-lg border border-slate-800 text-xs text-slate-400 hover:text-white"
                >
                  Anuluj
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Separator */}
        <div className="relative flex items-center justify-center my-6">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-slate-900 px-3 text-[11px] uppercase tracking-wider text-slate-500 absolute">
            lub hasło
          </span>
        </div>

        {/* Formularz hasła */}
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Adres Email</label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="twoj@email.com"
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-400">Hasło</label>
              <Link
                href="/recovery"
                className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
              >
                Logowanie awaryjne?
              </Link>
            </div>
            <div className="relative">
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || passkeyLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            <span>{loading ? "Weryfikacja..." : "Zaloguj hasłem"}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Stopka informacyjna o prywatności */}
        <div className="mt-8 pt-6 border-t border-slate-800/60 text-center">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-slate-600" />
            <span>Dostęp wyłącznie dla autoryzowanych kont. Rejestracja publiczna wyłączona.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
