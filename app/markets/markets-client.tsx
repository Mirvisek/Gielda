"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, TrendingUp, TrendingDown, ArrowRight, Shield, Loader2, Building2 } from "lucide-react";
import { MarketQuote } from "@/lib/market/types";
import NotificationBell from "@/components/notifications/notification-bell";

const POPULAR_SYMBOLS = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Technologia (US)" },
  { symbol: "NVDA", name: "NVIDIA Corporation", sector: "Półprzewodniki (US)" },
  { symbol: "MSFT", name: "Microsoft Corporation", sector: "Oprogramowanie (US)" },
  { symbol: "TSLA", name: "Tesla Inc.", sector: "Motoryzacja (US)" },
  { symbol: "PKO.WA", name: "PKO Bank Polski", sector: "Finanse (GPW)" },
  { symbol: "PKN.WA", name: "Orlen S.A.", sector: "Energetyka (GPW)" },
  { symbol: "CDR.WA", name: "CD Projekt", sector: "Gry / Gaming (GPW)" },
  { symbol: "ALE.WA", name: "Allegro.eu", sector: "E-Commerce (GPW)" },
  { symbol: "KGH.WA", name: "KGHM Polska Miedź", sector: "Surowce (GPW)" },
  { symbol: "DNP.WA", name: "Dino Polska", sector: "Handel detaliczny (GPW)" },
  { symbol: "PEO.WA", name: "Bank Pekao", sector: "Finanse (GPW)" },
  { symbol: "XTB.WA", name: "XTB S.A.", sector: "Finanse / Broker (GPW)" },
];

export default function MarketsClient({ initialOverview }: { initialOverview: MarketQuote[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<
    Array<{ symbol: string; name: string; exchange?: string; type?: string; currency?: string }>
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Wyszukiwanie na żywo z debouncingiem 300ms
  useEffect(() => {
    const term = search.trim();
    if (term.length < 1) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/markets/assets?q=${encodeURIComponent(term)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.assets || []);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error("Błąd wyszukiwania aktywów:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Zamykanie listy podpowiedzi po kliknięciu poza komponent
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (results.length > 0) {
      router.push(`/assets/${encodeURIComponent(results[0].symbol)}`);
    } else if (search.trim()) {
      router.push(`/assets/${encodeURIComponent(search.trim().toUpperCase())}`);
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

        {/* Wyszukiwarka Aktywów z podpowiedziami na żywo */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              Wyszukaj spółkę, indeks lub surowiec do analizy
            </h2>
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Obsługuje tickery polskie (GPW: PKO, ORLEN, CDR) oraz zagraniczne (NVDA, AAPL)
            </span>
          </div>

          <div ref={searchContainerRef} className="relative">
            <form onSubmit={handleSearchSubmit} className="flex gap-3">
              <div className="relative flex-1">
                {isSearching ? (
                  <Loader2 className="w-4 h-4 text-blue-400 absolute left-3.5 top-3 animate-spin pointer-events-none" />
                ) : (
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
                )}
                <input
                  type="text"
                  value={search}
                  onFocus={() => {
                    if (results.length > 0) setShowDropdown(true);
                  }}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Wpisz nazwę firmy lub ticker (np. Apple, PKO BP, Orlen, NVDA, CD Projekt)..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition-all shadow-md shadow-blue-600/20 cursor-pointer shrink-0"
              >
                Przejdź
              </button>
            </form>

            {/* Rozwijana lista wyników / podpowiedzi autouzupełniania */}
            {showDropdown && search.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-slate-900/95 backdrop-blur border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800 max-h-80 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                {results.length > 0 ? (
                  results.map((item) => (
                    <button
                      key={item.symbol}
                      type="button"
                      onClick={() => {
                        setShowDropdown(false);
                        router.push(`/assets/${encodeURIComponent(item.symbol)}`);
                      }}
                      className="w-full text-left p-3 hover:bg-slate-800/80 transition-colors flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-blue-400 bg-blue-950/60 border border-blue-800/60 px-2 py-0.5 rounded-md">
                          {item.symbol}
                        </span>
                        <div>
                          <div className="text-xs font-medium text-slate-100 group-hover:text-white transition-colors">
                            {item.name}
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            {item.exchange && <span>Giełda: {item.exchange}</span>}
                            {item.currency && (
                              <>
                                <span>•</span>
                                <span>Waluta: {item.currency}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-blue-400 transition-colors shrink-0" />
                    </button>
                  ))
                ) : isSearching ? (
                  <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    <span>Wyszukiwanie notowań spółki...</span>
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-slate-400">
                    <div>Brak bezpośrednich dopasowań dla „{search}”.</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Naciśnij <strong>Enter</strong>, aby spróbować otworzyć ticker bezpośrednio.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
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
