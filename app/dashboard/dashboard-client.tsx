"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import {
  Shield,
  KeyRound,
  LogOut,
  UserCheck,
  Compass,
  CheckCircle,
  AlertTriangle,
  Scale,
  Newspaper,
} from "lucide-react";

interface Props {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    status: string;
  };
  allowedMethods: string[];
}

export default function DashboardClient({ user, allowedMethods }: Props) {
  const router = useRouter();
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const handleAddPasskey = async () => {
    setPasskeyLoading(true);
    setMessage(null);

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
        body: JSON.stringify({
          response: regResponse,
          deviceName: `Urządzenie (${navigator.platform || "Browser"})`,
        }),
      });

      if (!verifyRes.ok) {
        throw new Error("Weryfikacja nowego klucza Passkey nie powiodła się");
      }

      setMessage({ type: "success", text: "Nowy klucz Passkey został pomyślnie dodany!" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Błąd rejestracji Passkey";
      if (!msg.includes("abort") && !msg.includes("cancel")) {
        setMessage({ type: "error", text: msg });
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Pasek nawigacyjny */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50 px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider uppercase text-slate-100">
              Market Intelligence
            </h1>
            <p className="text-[10px] text-slate-500">Prywatne Centrum Analityczne</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <nav className="hidden md:flex items-center gap-3 text-xs">
            <Link
              href="/markets"
              className="text-slate-400 hover:text-slate-200 transition-colors font-medium"
            >
              Rynki
            </Link>
            <Link
              href="/news"
              className="text-slate-400 hover:text-slate-200 transition-colors font-medium"
            >
              Wiadomości
            </Link>
            <Link
              href="/predictions"
              className="text-slate-400 hover:text-slate-200 transition-colors font-medium flex items-center gap-1"
            >
              Prognozy
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            </Link>
            {user.role === "ADMIN" && (
              <Link
                href="/admin"
                className="text-amber-400 hover:text-amber-300 transition-colors font-medium"
              >
                Admin
              </Link>
            )}
          </nav>

          <div className="hidden sm:flex flex-col text-right border-l border-slate-800 pl-3">
            <span className="text-xs font-medium text-slate-200">{user.displayName}</span>
            <span className="text-[10px] text-slate-400 font-mono">{user.email}</span>
          </div>

          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-950 text-blue-400 border border-blue-800 uppercase">
            {user.role}
          </span>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Wyloguj</span>
          </button>
        </div>
      </header>

      {/* Główna treść */}
      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        {message && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              message.type === "success"
                ? "bg-emerald-950/50 border-emerald-800/80 text-emerald-300"
                : "bg-red-950/50 border-red-800/80 text-red-300"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Status Bezpieczeństwa Sesji */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <UserCheck className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-semibold text-slate-100">
                  Uwierzytelnienie Bezpieczne (Active Session)
                </h2>
              </div>
              <p className="text-xs text-slate-400">
                Sesja zabezpieczona tokenem CSPRNG (SHA-256) w ciasteczku HttpOnly Secure.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleAddPasskey}
                disabled={passkeyLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all shadow-md shadow-blue-600/20 disabled:opacity-50 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>{passkeyLoading ? "Rejestrowanie..." : "Dodaj kolejny Passkey"}</span>
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 flex flex-wrap gap-2 text-xs">
            <span className="text-slate-400 py-1">Dozwolone metody logowania:</span>
            {allowedMethods.map((m) => (
              <span
                key={m}
                className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300"
              >
                {m}
              </span>
            ))}
          </div>
        </div>

        {/* Dostępne moduły analityczne */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/markets"
            className="p-5 bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-2xl transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider group-hover:text-blue-400 transition-colors">
                Moduł Rynkowy
              </span>
              <Compass className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-lg font-bold text-slate-100 group-hover:text-white transition-colors">
              Rynki & Wskaźniki
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Notowania, świece OHLCV, średnie SMA/EMA, RSI(14) i wskaźniki techniczne.
            </p>
          </Link>

          <Link
            href="/news"
            className="p-5 bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-2xl transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider group-hover:text-emerald-400 transition-colors">
                Silnik Wiadomości & AI
              </span>
              <Newspaper className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-slate-100 group-hover:text-white transition-colors">
              Agregacja & Sentyment
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Kanały RSS, tarcza przed prompt injection, deduplikacja SimHash i analiza LLM.
            </p>
          </Link>

          <Link
            href="/predictions"
            className="p-5 bg-slate-900/60 border border-slate-800 hover:border-amber-500/50 rounded-2xl transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider group-hover:text-amber-400 transition-colors">
                Prediction Journal
              </span>
              <Scale className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-lg font-bold text-slate-100 group-hover:text-white transition-colors">
              Dziennik Prognoz & Kalibracja
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Niezmienny rejestr prognoz, Brier Score i weryfikacja stóp zwrotu +1d/7d/30d/90d.
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
