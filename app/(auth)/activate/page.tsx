"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { Shield, KeyRound, Copy, Check, AlertCircle } from "lucide-react";

function ActivateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<"FORM" | "CODES" | "PASSKEY_PROMPT">("FORM");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = searchParams.get("token");
    if (t) setToken(t);
  }, [searchParams]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 12) {
      setError("Hasło musi mieć co najmniej 12 znaków.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Wprowadzone hasła nie są identyczne.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Błąd aktywacji konta.");
      }

      setRecoveryCodes(data.recoveryCodes || []);
      setStep("CODES");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Wystąpił błąd aktywacji.");
    } finally {
      setLoading(false);
    }
  };

  const copyCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRegisterPasskey = async () => {
    setLoading(true);
    setError(null);

    try {
      const optRes = await fetch("/api/auth/passkey/register/options", {
        method: "POST",
      });

      if (!optRes.ok) {
        throw new Error("Błąd pobierania opcji rejestracji Passkey");
      }

      const options = await optRes.json();
      const regResponse = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: regResponse, deviceName: "Główny klucz Passkey" }),
      });

      if (!verifyRes.ok) {
        throw new Error("Weryfikacja rejestracji Passkey nie powiodła się");
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Błąd rejestracji Passkey");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 mb-3">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold tracking-wide uppercase text-slate-100">
            Aktywacja Konta Użytkownika
          </h1>
          <p className="text-xs text-slate-400 mt-1">Ustaw silne hasło i zabezpiecz dostęp</p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {step === "FORM" && (
          <form onSubmit={handleActivate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Token aktywacyjny
              </label>
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Wklej token z zaproszenia..."
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Nowe hasło (min. 12 znaków)
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Potwierdź hasło
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Aktywowanie..." : "Aktywuj konto"}
            </button>
          </form>
        )}

        {step === "CODES" && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs">
              <p className="font-semibold mb-1">Zapisz jednorazowe kody recovery!</p>
              <p className="text-amber-300/80">
                Kody te są jedynym ratunkiem w razie utraty urządzenia i kluczy biometrycznych.
                Każdy kod działa tylko jeden raz.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-center text-xs tracking-wider text-slate-300">
              {recoveryCodes.map((code, idx) => (
                <div key={idx} className="p-2 bg-slate-900 rounded-lg">
                  {code}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={copyCodes}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? "Skopiowano do schowka!" : "Skopiuj wszystkie kody"}</span>
            </button>

            <button
              type="button"
              onClick={() => setStep("PASSKEY_PROMPT")}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-all cursor-pointer"
            >
              Dalej: Rejestracja Passkey
            </button>
          </div>
        )}

        {step === "PASSKEY_PROMPT" && (
          <div className="space-y-6 text-center">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <KeyRound className="w-10 h-10 text-blue-400 mx-auto mb-3" />
              <h2 className="text-sm font-semibold text-slate-200 mb-1">
                Zarejestruj swój klucz Passkey
              </h2>
              <p className="text-xs text-slate-400">
                Pozwala na natychmiastowe logowanie za pomocą Face ID, Touch ID lub Windows Hello bez
                wpisywania hasła.
              </p>
            </div>

            <button
              type="button"
              onClick={handleRegisterPasskey}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-all cursor-pointer"
            >
              {loading ? "Rejestracja..." : "Dodaj Passkey tego urządzenia"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-400 transition-colors"
            >
              Pomiń na razie i przejdź do Dashboardu
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <ActivateContent />
    </Suspense>
  );
}
