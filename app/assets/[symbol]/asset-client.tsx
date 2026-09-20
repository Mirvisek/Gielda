"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, RefreshCw, Newspaper } from "lucide-react";
import { MarketQuote, OHLCV, TechnicalIndicators } from "@/lib/market/types";
import PriceChart from "@/components/market/price-chart";
import TechnicalPanel from "@/components/market/technical-panel";
import SignalPanel from "@/components/market/signal-panel";
import { GeneratedSignal } from "@/lib/scoring/types";

interface RelatedNewsItem {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  sourceTier: string;
  sourceReliabilityScore: number;
  sentimentScore: number | null;
  publishedAt: string | Date;
  sourceUrl?: string | null;
}

interface Props {
  symbol: string;
  initialQuote: MarketQuote;
  initialCandles: OHLCV[];
  initialIndicators: TechnicalIndicators;
  initialNews?: unknown[];
  initialSignal?: GeneratedSignal | null;
}

export default function AssetClient({
  symbol,
  initialQuote,
  initialCandles,
  initialIndicators,
  initialNews = [],
  initialSignal = null,
}: Props) {
  const [quote, setQuote] = useState<MarketQuote>(initialQuote);
  const [candles, setCandles] = useState<OHLCV[]>(initialCandles);
  const [indicators, setIndicators] = useState<TechnicalIndicators>(initialIndicators);
  const [news] = useState<RelatedNewsItem[]>(initialNews as RelatedNewsItem[]);
  const [timeframe, setTimeframe] = useState<"1w" | "1m" | "3m" | "6m" | "1y">("1m");
  const [loading, setLoading] = useState(false);

  const isUp = quote.change >= 0;

  const handleTimeframeChange = async (tf: "1w" | "1m" | "3m" | "6m" | "1y") => {
    setTimeframe(tf);
    setLoading(true);

    try {
      const res = await fetch(`/api/markets/assets/${symbol}/history?range=${tf}&interval=1d`);
      if (res.ok) {
        const data = await res.json();
        const loadedCandles: OHLCV[] = (data.candles || []).map(
          (c: OHLCV & { timestamp: string | Date }) => ({
            ...c,
            timestamp: new Date(c.timestamp),
          })
        );
        setCandles(loadedCandles);
      }
    } catch (err) {
      console.error("Błąd zmiany timeframe:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const [quoteRes, indRes] = await Promise.all([
        fetch(`/api/markets/assets/${symbol}`),
        fetch(`/api/markets/assets/${symbol}/indicators`),
      ]);

      if (quoteRes.ok) {
        const qData = await quoteRes.json();
        setQuote({ ...qData.quote, timestamp: new Date(qData.quote.timestamp) });
      }

      if (indRes.ok) {
        const iData = await indRes.json();
        setIndicators(iData.indicators);
      }
    } catch (err) {
      console.error("Błąd odświeżania:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Pasek nawigacji */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50 px-4 lg:px-8 py-3 flex items-center justify-between">
        <Link
          href="/markets"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Wróć do listy rynków</span>
        </Link>

        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-400" : ""}`} />
          <span>Odśwież</span>
        </button>
      </header>

      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Nagłówek Aktywa */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold font-mono tracking-wide text-slate-100">
                  {symbol}
                </h1>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 border border-slate-700 text-slate-400 uppercase">
                  {quote.currency}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  Źródło: {quote.source}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Ostatnia aktualizacja: {new Date(quote.timestamp).toLocaleTimeString()}
              </p>
            </div>

            <div className="flex sm:flex-col sm:items-end justify-between items-center">
              <div className="text-3xl font-bold font-mono text-slate-100">
                ${quote.price.toFixed(2)}
              </div>
              <div
                className={`text-sm font-semibold font-mono flex items-center gap-1 mt-0.5 ${
                  isUp ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>
                  {isUp ? "+" : ""}
                  {quote.change.toFixed(2)} ({isUp ? "+" : ""}
                  {quote.changePercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Podstawowe statystyki sesji */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-slate-800/80 text-xs font-mono">
            <div>
              <span className="text-slate-500 text-[11px] block">Otwarcie (Open)</span>
              <span className="text-slate-200">${quote.open.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block">Maksimum (High)</span>
              <span className="text-slate-200">${quote.high.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block">Minimum (Low)</span>
              <span className="text-slate-200">${quote.low.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-slate-500 text-[11px] block">Wolumen</span>
              <span className="text-slate-200">{quote.volume.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Wykres Ceny */}
        <PriceChart
          candles={candles}
          timeframe={timeframe}
          onTimeframeChange={handleTimeframeChange}
          loading={loading}
        />

        {/* Silnik Scoringu i Sygnałów AI */}
        <SignalPanel symbol={symbol} initialSignal={initialSignal} />

        {/* Panel Wskaźników Technicznych */}
        <TechnicalPanel indicators={indicators} />

        {/* Powiązane Wiadomości i Sentyment */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">
                Wiadomości i Analizy dla {symbol}
              </h2>
            </div>
            <Link
              href={`/news?symbol=${symbol}`}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium"
            >
              Zobacz wszystkie w Silniku Wiadomości →
            </Link>
          </div>

          {news.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              Brak bezpośrednio powiązanych wiadomości w bieżącym okresie dla {symbol}.
            </p>
          ) : (
            <div className="space-y-3">
              {news.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80 hover:border-slate-700 transition-colors space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span className="font-semibold text-blue-400">{item.source}</span>
                    <span>
                      {new Date(item.publishedAt).toLocaleDateString("pl-PL", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-200 hover:text-white">
                    {item.sourceUrl ? (
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </h3>
                  {item.summary && (
                    <p className="text-xs text-slate-400 line-clamp-2">{item.summary}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
