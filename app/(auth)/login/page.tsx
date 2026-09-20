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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

        {/* Logowanie zewnętrzne OAuth (tylko powiązane konta) */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          <button
            type="button"
            onClick={() => setErrorMessage("Wymagane uprzednie powiązanie konta przez administratora.")}
            className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 text-xs text-slate-300 transition-colors cursor-pointer"
          >
            <span>Google</span>
          </button>
          <button
            type="button"
            onClick={() => setErrorMessage("Wymagane uprzednie powiązanie konta przez administratora.")}
            className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 text-xs text-slate-300 transition-colors cursor-pointer"
          >
            <span>Apple</span>
          </button>
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
