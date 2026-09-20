"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function RecoveryPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecoveryLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, recoveryCode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Nieprawidłowy kod recovery lub brak dostępu.");
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Błąd autoryzacji awaryjnej");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-600/20 border border-amber-500/30 text-amber-400 mb-3">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold tracking-wide uppercase text-slate-100">
            Awaryjne Logowanie Kodem
          </h1>
          <p className="text-xs text-slate-400 mt-1">Użyj jednorazowego kodu recovery</p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleRecoveryLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Adres Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="twoj@email.com"
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Jednorazowy Kod Recovery
            </label>
            <input
              type="text"
              required
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono tracking-widest text-slate-200 focus:outline-none focus:border-amber-500 transition-colors text-center"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Weryfikacja..." : "Zaloguj kodem awaryjnym"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-800 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Wróć do zwykłego logowania</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
