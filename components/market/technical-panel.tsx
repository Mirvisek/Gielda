"use client";

import { TechnicalIndicators } from "@/lib/market/types";
import { Activity } from "lucide-react";

interface Props {
  indicators: TechnicalIndicators;
}

export default function TechnicalPanel({ indicators }: Props) {
  const {
    currentPrice,
    rsi14,
    sma20,
    sma50,
    sma200,
    ema20,
    atr14,
    return1d,
    return5d,
    return20d,
    return60d,
    volumeChangePercent,
    volumeRatio20d,
  } = indicators;

  // Status RSI
  let rsiLabel = "Neutralny";
  let rsiBadgeBg = "bg-slate-800 text-slate-300";
  if (rsi14 !== null) {
    if (rsi14 >= 70) {
      rsiLabel = "Wykupienie (>70)";
      rsiBadgeBg = "bg-red-950/80 border border-red-800 text-red-400";
    } else if (rsi14 <= 30) {
      rsiLabel = "Wyprzedanie (<30)";
      rsiBadgeBg = "bg-emerald-950/80 border border-emerald-800 text-emerald-400";
    }
  }

  const formatDistance = (avg: number | null) => {
    if (avg === null || avg <= 0 || currentPrice <= 0) return "—";
    const diff = ((currentPrice - avg) / avg) * 100;
    const sign = diff >= 0 ? "+" : "";
    return `${sign}${diff.toFixed(1)}%`;
  };

  const formatReturn = (val: number | null) => {
    if (val === null) return "—";
    const sign = val >= 0 ? "+" : "";
    const color = val >= 0 ? "text-emerald-400" : "text-red-400";
    return <span className={`font-mono font-bold ${color}`}>{`${sign}${val.toFixed(2)}%`}</span>;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100">
            Wskaźniki Techniczne (Obiektywne Dane)
          </h3>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">Brak rekomendacji BUY/SELL</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* RSI 14 */}
        <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">RSI (14 okresów)</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${rsiBadgeBg}`}>
              {rsiLabel}
            </span>
          </div>

          <div className="text-2xl font-bold font-mono text-slate-100">
            {rsi14 !== null ? rsi14.toFixed(1) : "—"}
          </div>

          {/* Pasek postępu RSI */}
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden relative">
            <div
              className={`h-full transition-all ${
                rsi14 && rsi14 >= 70
                  ? "bg-red-500"
                  : rsi14 && rsi14 <= 30
                  ? "bg-emerald-500"
                  : "bg-blue-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, rsi14 || 50))}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-slate-500 font-mono">
            <span>0</span>
            <span>30</span>
            <span>50</span>
            <span>70</span>
            <span>100</span>
          </div>
        </div>

        {/* Średnie Kroczące (SMA / EMA) */}
        <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2 text-xs">
          <span className="font-semibold text-slate-400 block mb-1">Średnie Kroczące</span>
          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">SMA 20:</span>
              <span className="text-slate-200">
                {sma20 ? sma20.toFixed(2) : "—"}{" "}
                <span className="text-[10px] text-slate-500">({formatDistance(sma20)})</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">SMA 50:</span>
              <span className="text-slate-200">
                {sma50 ? sma50.toFixed(2) : "—"}{" "}
                <span className="text-[10px] text-slate-500">({formatDistance(sma50)})</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">SMA 200:</span>
              <span className="text-slate-200">
                {sma200 ? sma200.toFixed(2) : "—"}{" "}
                <span className="text-[10px] text-slate-500">({formatDistance(sma200)})</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">EMA 20:</span>
              <span className="text-slate-200">
                {ema20 ? ema20.toFixed(2) : "—"}{" "}
                <span className="text-[10px] text-slate-500">({formatDistance(ema20)})</span>
              </span>
            </div>
          </div>
        </div>

        {/* Zmienność i Wolumen */}
        <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2 text-xs">
          <span className="font-semibold text-slate-400 block mb-1">Zmienność & Wolumen</span>
          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">ATR 14:</span>
              <span className="text-slate-200 font-bold">
                {atr14 ? `${atr14.toFixed(2)}` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Zmiana wolumenu (1d):</span>
              <span className="text-slate-200">
                {volumeChangePercent !== null ? (
                  <span className={volumeChangePercent >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {volumeChangePercent >= 0 ? "+" : ""}
                    {volumeChangePercent.toFixed(1)}%
                  </span>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Ratio wolumenu (vs SMA20):</span>
              <span className="text-slate-200 font-bold">
                {volumeRatio20d !== null ? `${volumeRatio20d.toFixed(2)}x` : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stopy zwrotu */}
      <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-4 text-xs">
        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
          Stopy Zwrotu:
        </span>
        <div className="flex items-center gap-6 text-xs">
          <div>
            <span className="text-slate-500 text-[10px] block">1D</span>
            {formatReturn(return1d)}
          </div>
          <div>
            <span className="text-slate-500 text-[10px] block">5D</span>
            {formatReturn(return5d)}
          </div>
          <div>
            <span className="text-slate-500 text-[10px] block">20D (1M)</span>
            {formatReturn(return20d)}
          </div>
          <div>
            <span className="text-slate-500 text-[10px] block">60D (3M)</span>
            {formatReturn(return60d)}
          </div>
        </div>
      </div>
    </div>
  );
}
