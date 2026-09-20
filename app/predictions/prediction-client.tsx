"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ExternalLink,
  Target,
  BarChart3,
  Scale,
  AlertCircle,
} from "lucide-react";
import { CalibrationStats } from "@/lib/scoring/prediction-service";

export interface RawPredictionInput {
  id: string;
  assetId: string;
  signalId?: string | null;
  timestamp: string | Date;
  horizonDays: number;
  entryPrice: unknown;
  predictedDirection: string;
  opportunityScore?: number | null;
  riskScore?: number | null;
  confidence: number;
  status: string;
  thesis?: string | null;
  catalysts?: string | null;
  invalidators?: string | null;
  isImmutable: boolean;
  asset: {
    symbol: string;
    name: string;
  };
  result?: {
    id: string;
    predictionId: string;
    priceAfter1d?: unknown;
    priceAfter7d?: unknown;
    priceAfter30d?: unknown;
    priceAfter90d?: unknown;
    actualReturn1d?: unknown;
    actualReturn7d?: unknown;
    actualReturn30d?: unknown;
    actualReturn90d?: unknown;
    evaluatedAt?: string | Date | null;
    isSuccess?: boolean | null;
  } | null;
}

export interface SerializedPrediction {
  id: string;
  assetId: string;
  signalId: string | null;
  timestamp: string;
  horizonDays: number;
  entryPrice: number;
  predictedDirection: string;
  opportunityScore: number | null;
  riskScore: number | null;
  confidence: number;
  status: string;
  thesis: string | null;
  catalysts: string[] | null;
  invalidators: string[] | null;
  isImmutable: boolean;
  asset: {
    symbol: string;
    name: string;
  };
  result: {
    id: string;
    predictionId: string;
    priceAfter1d: number | null;
    priceAfter7d: number | null;
    priceAfter30d: number | null;
    priceAfter90d: number | null;
    actualReturn1d: number | null;
    actualReturn7d: number | null;
    actualReturn30d: number | null;
    actualReturn90d: number | null;
    evaluatedAt: string | null;
    isSuccess: boolean | null;
  } | null;
}

interface Props {
  initialPredictions: {
    items: SerializedPrediction[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  initialStats: CalibrationStats;
  currentUser: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
}

export default function PredictionClient({
  initialPredictions,
  initialStats,
  currentUser,
}: Props) {
  const [predictionsData, setPredictionsData] = useState(initialPredictions);
  const [stats, setStats] = useState<CalibrationStats>(initialStats);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Filtry
  const [searchSymbol, setSearchSymbol] = useState("");
  const [filterDirection, setFilterDirection] = useState<string>("ALL");
  const [filterResolution, setFilterResolution] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Stan akcji admina
  const [evaluating, setEvaluating] = useState(false);
  const [evalMessage, setEvalMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const isAdmin = currentUser.role === "ADMIN";

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchPredictions = async (targetPage = 1) => {
    setLoading(true);
    setEvalMessage(null);

    try {
      const params = new URLSearchParams();
      if (searchSymbol.trim()) params.set("symbol", searchSymbol.trim().toUpperCase());
      if (filterDirection !== "ALL") params.set("direction", filterDirection);
      if (filterResolution !== "ALL") params.set("resolution", filterResolution);
      params.set("page", targetPage.toString());
      params.set("limit", "20");
      params.set("stats", "true");

      const res = await fetch(`/api/predictions?${params.toString()}`);
      if (!res.ok) throw new Error("Błąd pobierania danych prognoz.");

      const data = await res.json();
      setPredictionsData({
        items: data.items.map(serializePrediction),
        total: data.total,
        page: data.page,
        limit: data.limit,
        totalPages: data.totalPages,
      });

      if (data.calibrationStats) {
        setStats(data.calibrationStats);
      }
      setPage(targetPage);
    } catch (err) {
      console.error(err);
      setEvalMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Nie udało się załadować danych.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPredictions(1);
  };

  const handleAdminEvaluation = async () => {
    if (!isAdmin) return;
    setEvaluating(true);
    setEvalMessage(null);

    try {
      const res = await fetch("/api/predictions", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Wystąpił błąd podczas ewaluacji.");
      }

      setEvalMessage({
        type: "success",
        text: `Ewaluacja zakończona sukcesem. Zaktualizowano ${data.result?.evaluatedCount ?? 0} prognoz.`,
      });

      // Odśwież dane
      await fetchPredictions(page);
    } catch (err) {
      setEvalMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Błąd autoryzacji lub wykonania ewaluacji.",
      });
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Pasek nawigacyjny */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50 px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wider uppercase text-slate-100">
                Prediction Journal
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                Immutable Registry
              </span>
            </div>
            <p className="text-[10px] text-slate-500">
              Weryfikacja historyczna, stopy zwrotu i kalibracja prawdopodobieństwa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/markets"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors hidden sm:inline"
          >
            Rynki
          </Link>
          <Link
            href="/news"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors hidden sm:inline"
          >
            Wiadomości
          </Link>

          {isAdmin && (
            <button
              onClick={handleAdminEvaluation}
              disabled={evaluating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
              title="Wymuszenie uruchomienia ewaluacji dojrzałych prognoz (Tylko Admin)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${evaluating ? "animate-spin" : ""}`} />
              <span>{evaluating ? "Ewaluacja..." : "Ewaluuj dojrzałe"}</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Komunikat o akcji ewaluacji */}
        {evalMessage && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
              evalMessage.type === "success"
                ? "bg-emerald-950/50 border-emerald-800/80 text-emerald-300"
                : "bg-red-950/50 border-red-800/80 text-red-300"
            }`}
          >
            {evalMessage.type === "success" ? (
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            )}
            <span>{evalMessage.text}</span>
          </div>
        )}

        {/* Sekcja 1: Hero Metrics Kalibracji */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Karta: Brier Score */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider">Brier Score</span>
              <Target className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-3xl font-bold font-mono text-slate-100">
              {stats.totalEvaluated > 0 ? stats.brierScore.toFixed(4) : "—"}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 font-mono">
              <span>N = {stats.totalEvaluated}</span>
              <span className="text-slate-500">Lower is better (0.0 = idealna)</span>
            </div>
          </div>

          {/* Karta: Rejestr Prognoz */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider">Liczba Prognoz</span>
              <Scale className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-3xl font-bold font-mono text-slate-100">
              {predictionsData.total}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 font-mono">
              <span className="text-emerald-400">
                Rozstrzygnięte: {stats.totalEvaluated}
              </span>
              <span className="text-amber-400">
                W trakcie: {Math.max(0, predictionsData.total - stats.totalEvaluated)}
              </span>
            </div>
          </div>

          {/* Karta: Ogólny Win Rate */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider">Empiryczny Win Rate</span>
              <BarChart3 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-3xl font-bold font-mono text-slate-100">
              {stats.totalEvaluated > 0 ? `${stats.overallWinRatePercent}%` : "—"}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 font-mono">
              <span>Wynik z PredictionResult</span>
              <span className="text-slate-500">
                {stats.totalEvaluated > 0
                  ? `${Math.round((stats.overallWinRatePercent / 100) * stats.totalEvaluated)} / ${stats.totalEvaluated}`
                  : "0 obserwacji"}
              </span>
            </div>
          </div>
        </div>

        {/* Sekcja 2: Wizualizator Przedziałów Pewności (Confidence Buckets) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                Analiza Kalibracji w Przedziałach Pewności (Calibration Buckets)
              </h2>
              <p className="text-[11px] text-slate-400">
                Zestawienie empirycznej trafności (Observed Win Rate) ze średnią pewnością w danym przedziale
              </p>
            </div>
          </div>

          {stats.buckets.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              Brak dojrzałych prognoz do wyznaczenia przedziałów kalibracyjnych.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {stats.buckets.map((b) => {
                const hasObservations = b.totalPredictions > 0;
                const gap = b.calibrationGap;
                const isGapPositive = gap >= 0;

                return (
                  <div
                    key={b.bucketName}
                    className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">
                        {b.bucketName}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        N = {b.totalPredictions}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-400">Observed Win Rate:</span>
                        <span className="font-semibold text-slate-200">
                          {hasObservations ? `${b.winRatePercent}%` : "—"}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, b.winRatePercent)}%` }}
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div>
                        <span className="text-slate-500 block">Śr. pewność:</span>
                        <span className="text-slate-300">
                          {hasObservations ? `${b.avgConfidence}%` : "—"}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 block">Calibration Gap:</span>
                        <span
                          className={`font-semibold ${
                            !hasObservations
                              ? "text-slate-500"
                              : isGapPositive
                              ? "text-emerald-400"
                              : "text-amber-400"
                          }`}
                        >
                          {hasObservations
                            ? `${isGapPositive ? "+" : ""}${gap} pp`
                            : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sekcja 3: Pasek Filtrów i Wyszukiwania */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value)}
                placeholder="Filtruj po tickerze (np. AAPL)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors uppercase font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-xl transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
            >
              Szukaj
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filtr Kierunku */}
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-slate-500 text-[11px]">Kierunek:</span>
              <select
                value={filterDirection}
                onChange={(e) => {
                  setFilterDirection(e.target.value);
                  setTimeout(() => fetchPredictions(1), 0);
                }}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="ALL">Wszystkie</option>
                <option value="POSITIVE">LONG (Wzrost)</option>
                <option value="NEGATIVE">SHORT (Spadek)</option>
                <option value="NEUTRAL">NEUTRAL</option>
              </select>
            </div>

            {/* Filtr Rozstrzygnięcia */}
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-slate-500 text-[11px]">Status:</span>
              <select
                value={filterResolution}
                onChange={(e) => {
                  setFilterResolution(e.target.value);
                  setTimeout(() => fetchPredictions(1), 0);
                }}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="ALL">Wszystkie</option>
                <option value="SUCCESS">Trafione (Sukces)</option>
                <option value="FAILURE">Nietrafione (Porażka)</option>
                <option value="PENDING">W trakcie ewaluacji</option>
              </select>
            </div>
          </div>
        </div>

        {/* Sekcja 4: Lista Prognoz */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>
              Wyniki {predictionsData.items.length} z {predictionsData.total}
            </span>
            <span>
              Strona {predictionsData.page} z {Math.max(1, predictionsData.totalPages)}
            </span>
          </div>

          {predictionsData.items.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-2">
              <Scale className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">Brak prognoz w dzienniku</p>
              <p className="text-xs text-slate-500">
                Nie znaleziono zarejestrowanych prognoz spełniających zadane kryteria filtrów.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {predictionsData.items.map((pred) => {
                const isExpanded = expandedIds.has(pred.id);
                const isLong = pred.predictedDirection === "POSITIVE" || pred.predictedDirection === "LONG";
                const isShort = pred.predictedDirection === "NEGATIVE" || pred.predictedDirection === "SHORT";

                // Rezultat z backendu
                const result = pred.result;
                const isResolved = result && result.isSuccess !== null;
                const isSuccess = result?.isSuccess === true;

                return (
                  <div
                    key={pred.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 transition-colors"
                  >
                    {/* Górna belka karty */}
                    <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/assets/${pred.asset.symbol}`}
                          className="text-lg font-bold font-mono text-slate-100 hover:text-blue-400 transition-colors flex items-center gap-1.5"
                        >
                          {pred.asset.symbol}
                          <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                        </Link>
                        <span className="text-xs text-slate-400 truncate max-w-[180px]">
                          {pred.asset.name}
                        </span>

                        {/* Kierunek */}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono uppercase ${
                            isLong
                              ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800/80"
                              : isShort
                              ? "bg-red-950/80 text-red-300 border border-red-800/80"
                              : "bg-slate-800 text-slate-300 border border-slate-700"
                          }`}
                        >
                          {isLong ? "LONG" : isShort ? "SHORT" : "NEUTRAL"}
                        </span>

                        {/* Status rozstrzygnięcia ściśle z PredictionResult */}
                        {isResolved ? (
                          isSuccess ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                              <CheckCircle className="w-3 h-3" />
                              Trafiona
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-950/80 text-red-400 border border-red-800">
                              <XCircle className="w-3 h-3" />
                              Nietrafiona
                            </span>
                          )
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/80">
                            <Clock className="w-3 h-3" />
                            W trakcie
                          </span>
                        )}
                      </div>

                      {/* Szczegóły punktowe */}
                      <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                        <div className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                          <span className="text-slate-500 text-[10px] block">Cena Bazowa:</span>
                          <span className="text-slate-200 font-semibold">
                            ${pred.entryPrice.toFixed(2)}
                          </span>
                        </div>

                        <div className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                          <span className="text-slate-500 text-[10px] block">Opportunity:</span>
                          <span className="text-emerald-400 font-semibold">
                            {pred.opportunityScore ?? "—"}/100
                          </span>
                        </div>

                        <div className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                          <span className="text-slate-500 text-[10px] block">Risk:</span>
                          <span className="text-red-400 font-semibold">
                            {pred.riskScore ?? "—"}/100
                          </span>
                        </div>

                        <div className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                          <span className="text-slate-500 text-[10px] block">Pewność:</span>
                          <span className="text-blue-400 font-semibold">
                            {pred.confidence}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Tracker Milestone'ów Post-Hoc (+1d, +7d, +30d, +90d) */}
                    <div className="p-4 bg-slate-950/40 border-b border-slate-800/60">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        Weryfikacja stóp zwrotu w czasie (Post-Hoc Returns Tracker):
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                        {/* +1d */}
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-0.5">
                          <span className="text-[10px] text-slate-500 block">Horyzont +1d</span>
                          {result?.actualReturn1d !== null && result?.actualReturn1d !== undefined ? (
                            <div>
                              <div
                                className={`font-semibold ${
                                  result.actualReturn1d >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                {result.actualReturn1d >= 0 ? "+" : ""}
                                {result.actualReturn1d.toFixed(2)}%
                              </div>
                              <span className="text-[10px] text-slate-400">
                                ${result.priceAfter1d?.toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600 text-[11px]">Oczekuje</span>
                          )}
                        </div>

                        {/* +7d */}
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-0.5">
                          <span className="text-[10px] text-slate-500 block">Horyzont +7d</span>
                          {result?.actualReturn7d !== null && result?.actualReturn7d !== undefined ? (
                            <div>
                              <div
                                className={`font-semibold ${
                                  result.actualReturn7d >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                {result.actualReturn7d >= 0 ? "+" : ""}
                                {result.actualReturn7d.toFixed(2)}%
                              </div>
                              <span className="text-[10px] text-slate-400">
                                ${result.priceAfter7d?.toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600 text-[11px]">Oczekuje</span>
                          )}
                        </div>

                        {/* +30d */}
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-0.5">
                          <span className="text-[10px] text-slate-500 block">Horyzont +30d</span>
                          {result?.actualReturn30d !== null && result?.actualReturn30d !== undefined ? (
                            <div>
                              <div
                                className={`font-semibold ${
                                  result.actualReturn30d >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                {result.actualReturn30d >= 0 ? "+" : ""}
                                {result.actualReturn30d.toFixed(2)}%
                              </div>
                              <span className="text-[10px] text-slate-400">
                                ${result.priceAfter30d?.toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600 text-[11px]">Oczekuje</span>
                          )}
                        </div>

                        {/* +90d */}
                        <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-0.5">
                          <span className="text-[10px] text-slate-500 block">Horyzont +90d</span>
                          {result?.actualReturn90d !== null && result?.actualReturn90d !== undefined ? (
                            <div>
                              <div
                                className={`font-semibold ${
                                  result.actualReturn90d >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                              >
                                {result.actualReturn90d >= 0 ? "+" : ""}
                                {result.actualReturn90d.toFixed(2)}%
                              </div>
                              <span className="text-[10px] text-slate-400">
                                ${result.priceAfter90d?.toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600 text-[11px]">Oczekuje</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Rozwijane szczegóły tezy i założeń */}
                    <div className="px-5 py-3 bg-slate-900/80 flex items-center justify-between text-xs">
                      <div className="text-[11px] text-slate-500 font-mono">
                        Data zapisu: {new Date(pred.timestamp).toLocaleString("pl-PL")}
                      </div>

                      <button
                        onClick={() => toggleExpand(pred.id)}
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium cursor-pointer transition-colors"
                      >
                        <span>{isExpanded ? "Zwiń szczegóły tezy" : "Pokaż szczegóły tezy AI"}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="p-5 border-t border-slate-800 bg-slate-950/70 space-y-4 text-xs">
                        {pred.thesis && (
                          <div className="space-y-1">
                            <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                              Podsumowanie Tezy:
                            </span>
                            <p className="text-slate-300 leading-relaxed">{pred.thesis}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/60">
                          {/* Katalizatory */}
                          <div className="space-y-2">
                            <span className="text-emerald-400 font-semibold uppercase text-[10px] tracking-wider flex items-center gap-1">
                              <Target className="w-3 h-3" />
                              Kluczowe Katalizatory Cenowe:
                            </span>
                            {pred.catalysts && pred.catalysts.length > 0 ? (
                              <ul className="space-y-1.5 list-disc list-inside text-slate-300">
                                {pred.catalysts.map((cat, idx) => (
                                  <li key={idx} className="leading-snug">
                                    {cat}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-slate-500 italic">Brak wyszczególnionych katalizatorów.</span>
                            )}
                          </div>

                          {/* Czynniki Unieważniające */}
                          <div className="space-y-2">
                            <span className="text-amber-400 font-semibold uppercase text-[10px] tracking-wider flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Czynniki Unieważniające (Invalidators):
                            </span>
                            {pred.invalidators && pred.invalidators.length > 0 ? (
                              <ul className="space-y-1.5 list-disc list-inside text-slate-300">
                                {pred.invalidators.map((inv, idx) => (
                                  <li key={idx} className="leading-snug">
                                    {inv}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-slate-500 italic">Brak zdefiniowanych poziomów unieważniających.</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Kontrolki Paginacji */}
          {predictionsData.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => fetchPredictions(page - 1)}
                disabled={page <= 1 || loading}
                className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Poprzednia
              </button>
              <span className="text-xs font-mono text-slate-400 px-3">
                {page} / {predictionsData.totalPages}
              </span>
              <button
                onClick={() => fetchPredictions(page + 1)}
                disabled={page >= predictionsData.totalPages || loading}
                className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Następna
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// Funkcja pomocnicza do bezpiecznej serializacji z Prisma Decimal i JSON
export function serializePrediction(pred: RawPredictionInput): SerializedPrediction {
  let parsedCatalysts: string[] | null = null;
  let parsedInvalidators: string[] | null = null;

  try {
    if (pred.catalysts) parsedCatalysts = JSON.parse(pred.catalysts);
  } catch {
    parsedCatalysts = null;
  }

  try {
    if (pred.invalidators) parsedInvalidators = JSON.parse(pred.invalidators);
  } catch {
    parsedInvalidators = null;
  }

  const toNum = (val: unknown): number | null => {
    if (val === null || val === undefined) return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  };

  return {
    id: pred.id,
    assetId: pred.assetId,
    signalId: pred.signalId ?? null,
    timestamp: typeof pred.timestamp === "string" ? pred.timestamp : new Date(pred.timestamp).toISOString(),
    horizonDays: pred.horizonDays,
    entryPrice: toNum(pred.entryPrice) ?? 0,
    predictedDirection: pred.predictedDirection,
    opportunityScore: pred.opportunityScore ?? null,
    riskScore: pred.riskScore ?? null,
    confidence: pred.confidence,
    status: pred.status,
    thesis: pred.thesis ?? null,
    catalysts: parsedCatalysts,
    invalidators: parsedInvalidators,
    isImmutable: pred.isImmutable,
    asset: {
      symbol: pred.asset.symbol,
      name: pred.asset.name,
    },
    result: pred.result
      ? {
          id: pred.result.id,
          predictionId: pred.result.predictionId,
          priceAfter1d: toNum(pred.result.priceAfter1d),
          priceAfter7d: toNum(pred.result.priceAfter7d),
          priceAfter30d: toNum(pred.result.priceAfter30d),
          priceAfter90d: toNum(pred.result.priceAfter90d),
          actualReturn1d: toNum(pred.result.actualReturn1d),
          actualReturn7d: toNum(pred.result.actualReturn7d),
          actualReturn30d: toNum(pred.result.actualReturn30d),
          actualReturn90d: toNum(pred.result.actualReturn90d),
          evaluatedAt: pred.result.evaluatedAt ? new Date(pred.result.evaluatedAt).toISOString() : null,
          isSuccess: pred.result.isSuccess ?? null,
        }
      : null,
  };
}
