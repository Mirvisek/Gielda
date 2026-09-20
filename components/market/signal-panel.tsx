"use client";

import { useState } from "react";
import {
  Sparkles,
  ShieldAlert,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { GeneratedSignal } from "@/lib/scoring/types";

interface Props {
  symbol: string;
  initialSignal: GeneratedSignal | null;
}

export default function SignalPanel({ symbol, initialSignal }: Props) {
  const [signal, setSignal] = useState<GeneratedSignal | null>(initialSignal);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRefresh = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/signals/${symbol}`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.signal) {
        setSignal(data.signal);
      } else {
        setErrorMsg(data.error || "Błąd generowania sygnału.");
      }
    } catch {
      setErrorMsg("Błąd sieci podczas łączenia z silnikiem scoringowym.");
    } finally {
      setLoading(false);
    }
  };

  if (!signal) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
        <Sparkles className="w-8 h-8 mx-auto text-blue-400" />
        <h3 className="text-sm font-semibold text-slate-200">Silnik Sygnałów i Scoringu AI</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Brak wygenerowanego sygnału dla {symbol}. Kliknij poniżej, aby obliczyć Opportunity, Risk i Confidence Score.
        </p>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Obliczanie czynników..." : "Oblicz Sygnał AI"}
        </button>
      </div>
    );
  }

  const {
    opportunityScore,
    riskScore,
    confidenceScore,
    status,
    direction,
    timeHorizon,
    bullThesis,
    bearThesis,
    catalysts,
    invalidators,
    factors,
  } = signal;

  const getStatusBadge = () => {
    if (status === "INSUFFICIENT_CONFIDENCE") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800">
          <HelpCircle className="w-3.5 h-3.5 text-amber-400" /> INSUFFICIENT CONFIDENCE
        </span>
      );
    }
    if (status === "NO_CLEAR_SIGNAL") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
          <Clock className="w-3.5 h-3.5 text-slate-400" /> NO CLEAR SIGNAL
        </span>
      );
    }
    if (direction === "POSITIVE") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> POSITIVE SETUP
        </span>
      );
    }
    if (direction === "NEGATIVE") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-red-950/80 text-red-300 border border-red-800">
          <TrendingDown className="w-3.5 h-3.5 text-red-400" /> HIGH RISK / BEARISH
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300">
        NEUTRAL
      </span>
    );
  };

  const techFactors = factors.filter((f) => f.category === "TECHNICAL");
  const newsFactors = factors.filter((f) => f.category === "NEWS");

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6">
      {/* Nagłówek panelu sygnałów */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-slate-100">
              Scoring i Teza Inwestycyjna AI dla {symbol}
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Zablokowane punktacje deterministyczne (Factor Engine) z obiektywną tezą Bull/Bear.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {getStatusBadge()}
          <button
            onClick={handleRefresh}
            disabled={loading}
            title="Przelicz ponownie czynniki i tezę"
            className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      {/* 3 Zegary Punktacji (Opportunity, Risk, Confidence) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Opportunity Score */}
        <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Opportunity
            </span>
            <Target className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-400 font-mono">
              {opportunityScore}
            </span>
            <span className="text-xs text-slate-500 font-mono">/ 100</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${opportunityScore}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">Siła potencjału wzrostowego setupu</p>
        </div>

        {/* Risk Score */}
        <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Risk Score
            </span>
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-red-400 font-mono">{riskScore}</span>
            <span className="text-xs text-slate-500 font-mono">/ 100</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-red-500 h-full rounded-full transition-all"
              style={{ width: `${riskScore}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">Niezależny poziom zmienności i zagrożeń</p>
        </div>

        {/* Confidence Score */}
        <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Confidence
            </span>
            <HelpCircle className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-blue-400 font-mono">
              {confidenceScore}
            </span>
            <span className="text-xs text-slate-500 font-mono">/ 100</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-blue-500 h-full rounded-full transition-all"
              style={{ width: `${confidenceScore}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">Jakość danych i zbieżność czynników</p>
        </div>
      </div>

      {/* Paski Wpływu Czynników (Factor Breakdown) */}
      <div className="space-y-3 pt-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Rozbicie Czynników (Factor Breakdown)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {/* Techniczne */}
          <div className="p-3.5 bg-slate-950/40 rounded-xl border border-slate-800/60 space-y-2">
            <div className="font-semibold text-slate-300 flex items-center justify-between">
              <span>Czynniki Techniczne ({techFactors.length})</span>
              <span className="text-slate-500 text-[11px]">Waga: 40-50%</span>
            </div>
            <div className="space-y-1.5">
              {techFactors.map((f) => (
                <div key={f.name} className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">{f.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300 font-mono">{f.value}</span>
                    <span
                      className={`font-mono font-bold ${
                        f.normalizedValue > 0
                          ? "text-emerald-400"
                          : f.normalizedValue < 0
                          ? "text-red-400"
                          : "text-slate-400"
                      }`}
                    >
                      {f.normalizedValue >= 0 ? "+" : ""}
                      {f.normalizedValue.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Wiadomości i Sentyment */}
          <div className="p-3.5 bg-slate-950/40 rounded-xl border border-slate-800/60 space-y-2">
            <div className="font-semibold text-slate-300 flex items-center justify-between">
              <span>Czynniki Informacyjne & Zdarzenia ({newsFactors.length})</span>
              <span className="text-slate-500 text-[11px]">Waga: 20-30%</span>
            </div>
            <div className="space-y-1.5">
              {newsFactors.map((f) => (
                <div key={f.name} className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">{f.name}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono font-bold ${
                        f.normalizedValue > 0
                          ? "text-emerald-400"
                          : f.normalizedValue < 0
                          ? "text-red-400"
                          : "text-slate-400"
                      }`}
                    >
                      {f.normalizedValue >= 0 ? "+" : ""}
                      {f.normalizedValue.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Teza Inwestycyjna AI (Bull Case vs Bear Case) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        {/* Bull Case */}
        <div className="p-4 bg-emerald-950/20 border border-emerald-900/60 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <TrendingUp className="w-4 h-4" /> Bull Case (Scenariusz Pozytywny)
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">{bullThesis}</p>
        </div>

        {/* Bear Case */}
        <div className="p-4 bg-red-950/20 border border-red-900/60 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-red-400 font-bold text-xs uppercase tracking-wider">
            <TrendingDown className="w-4 h-4" /> Bear Case (Główne Ryzyka)
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">{bearThesis}</p>
        </div>
      </div>

      {/* Katalizatory i Unieważnienia (Catalysts vs Invalidators) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Katalizatory */}
        <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-2.5">
          <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
            <CheckCircle2 className="w-4 h-4" /> Potencjalne Katalizatory Wzrostu
          </div>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {catalysts.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-blue-500 font-bold mt-0.5">•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Unieważnienia (Invalidators) */}
        <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-2.5">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
            <XCircle className="w-4 h-4" /> Warunki Unieważnienia Tezy (Invalidators)
          </div>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {invalidators.map((inv, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <span>{inv}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Stopka: Informacja o niezmiennym zapisie w Prediction Journal */}
      <div className="text-[11px] text-slate-500 border-t border-slate-800/80 pt-3 flex flex-wrap items-center justify-between gap-2">
        <span>
          Horyzont: <strong className="text-slate-400">{timeHorizon}</strong> | Zapisano w Prediction Journal: {new Date(signal.timestamp).toLocaleTimeString("pl-PL")}
        </span>
        <span className="font-mono text-slate-600">ID: {signal.assetId.slice(0, 8)}...</span>
      </div>
    </div>
  );
}
