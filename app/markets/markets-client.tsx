"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, TrendingUp, TrendingDown, ArrowRight, Shield } from "lucide-react";
import { MarketQuote } from "@/lib/market/types";
import NotificationBell from "@/components/notifications/notification-bell";

const POPULAR_SYMBOLS = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technologia" },
  { symbol: "NVDA", name: "NVIDIA Corporation", sector: "Półprzewodniki" },
  { symbol: "MSFT", name: "Microsoft Corporation", sector: "Oprogramowanie" },
  { symbol: "GOOGL", name: "Alphabet Inc.", sector: "Internet" },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "E-Commerce" },
  { symbol: "TSLA", name: "Tesla Inc.", sector: "Motoryzacja" },
  { symbol: "META", name: "Meta Platforms", sector: "Social Media" },
  { symbol: "AMD", name: "Advanced Micro Devices", sector: "Półprzewodniki" },
];

export default function MarketsClient({ initialOverview }: { initialOverview: MarketQuote[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/assets/${search.trim().toUpperCase()}`);
    }
  };

  const getBenchmarkName = (sym: string) => {
    switch (sym) {
      case "SPY":
        return "S&P 500 (SPY)";
      case "QQQ":
        return "Nasdaq 100 (QQQ)";
      case "GLD":
        return "Złoto (GLD)";
      case "USO":
        return "Ropa Naftowa (USO)";
      default:
        return sym;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50 px-4 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider uppercase text-slate-100">
              Moduł Rynkowy (Market Engine)
            </h1>
            <p className="text-[10px] text-slate-500">Notowania, Świece OHLCV i Wskaźniki</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/news"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors hidden sm:inline"
          >
            Wiadomości
          </Link>
          <Link
            href="/predictions"
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors hidden sm:inline"
          >
            Prognozy
          </Link>
          <Link
            href="/portfolio"
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors hidden sm:inline"
          >
            Portfel
          </Link>
          <Link
            href="/alerts"
            className="text-xs text-rose-400 hover:text-rose-300 transition-colors hidden sm:inline"
          >
            Alerty
          </Link>
          <Link
            href="/settings"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors hidden sm:inline"
          >
            Ustawienia
          </Link>
          <NotificationBell />
          <Link
            href="/dashboard"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full space-y-8">
        {/* Reżim rynkowy / Benchmarki */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Główne Indeksy i Surowce (Benchmarki)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {initialOverview.map((q) => {
              const isUp = q.change >= 0;
              return (
                <Link
                  key={q.symbol}
                  href={`/assets/${q.symbol}`}
                  className="p-4 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl transition-all hover:scale-[1.01]"
                >
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                    <span className="font-semibold">{getBenchmarkName(q.symbol)}</span>
                    <span className="font-mono text-[10px] uppercase text-slate-500">{q.currency}</span>
                  </div>
                  <div className="text-xl font-bold font-mono text-slate-100">
                    ${q.price.toFixed(2)}
                  </div>
                  <div
                    className={`text-xs font-semibold font-mono flex items-center gap-1 mt-1 ${
                      isUp ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>
                      {isUp ? "+" : ""}
                      {q.change.toFixed(2)} ({isUp ? "+" : ""}
                      {q.changePercent.toFixed(2)}%)
                    </span>
                  </div>
                </Link>
              );
            })}
            {initialOverview.length === 0 && (
              <div className="col-span-4 p-4 text-center text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
                Brak notowań benchmarków.
              </div>
            )}
          </div>
        </section>

        {/* Wyszukiwarka Aktywów */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-100">Przejdź do analizy spółki lub indeksu</h2>
          <form onSubmit={handleSearchSubmit} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Wpisz ticker giełdowy (np. AAPL, NVDA, MSFT, TSLA)..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 uppercase font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition-all shadow-md shadow-blue-600/20 cursor-pointer"
            >
              Szukaj
            </button>
          </form>
        </section>

        {/* Popularne Aktywa */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Popularne Aktywa do Analizy
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {POPULAR_SYMBOLS.map((asset) => (
              <Link
                key={asset.symbol}
                href={`/assets/${asset.symbol}`}
                className="p-4 bg-slate-900/60 border border-slate-800 hover:border-blue-500/40 rounded-xl transition-all group flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-sm text-slate-100 group-hover:text-blue-400 transition-colors font-mono">
                    {asset.symbol}
                  </div>
                  <div className="text-xs text-slate-300">{asset.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{asset.sector}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-colors" />
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
