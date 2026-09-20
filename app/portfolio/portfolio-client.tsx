"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Search,
  ArrowLeft,
  ShieldAlert,
  PieChart,
  List,
  History,
  ArrowUpRight,
  Eye,
  X,
} from "lucide-react";
import {
  PortfolioSummary,
  WatchlistItemSummary,
  PortfolioTransactionDto,
  CashTransactionDto,
} from "@/lib/portfolio/types";

interface Props {
  initialPortfolio: PortfolioSummary;
  initialWatchlist: WatchlistItemSummary[];
  currentUser: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
}

type TabType = "positions" | "trades" | "cash" | "watchlist";

export default function PortfolioClient({
  initialPortfolio,
  initialWatchlist,
  currentUser,
}: Props) {
  const [portfolio, setPortfolio] = useState<PortfolioSummary>(initialPortfolio);
  const [watchlist, setWatchlist] = useState<WatchlistItemSummary[]>(initialWatchlist);
  const [activeTab, setActiveTab] = useState<TabType>("positions");

  // Transakcje i księga gotówki pobierane przy wejściu w odpowiednią zakładkę
  const [transactions, setTransactions] = useState<PortfolioTransactionDto[]>([]);
  const [cashTransactions, setCashTransactions] = useState<CashTransactionDto[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Globalne stany ładowania i powiadomień
  const [refreshing, setRefreshing] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Modal transakcji (Kupno / Sprzedaż)
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");
  const [tradeSymbol, setTradeSymbol] = useState("");
  const [tradeQuantity, setTradeQuantity] = useState("");
  const [tradePrice, setTradePrice] = useState("");
  const [tradeFee, setTradeFee] = useState("0");
  const [tradeNotes, setTradeNotes] = useState("");
  const [tradeSubmitting, setTradeSubmitting] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);

  // Modal operacji gotówkowych
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [cashOpType, setCashOpType] = useState<"DEPOSIT" | "WITHDRAWAL" | "ADJUSTMENT">("DEPOSIT");
  const [cashAmount, setCashAmount] = useState("");
  const [cashDescription, setCashDescription] = useState("");
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);

  // Modal / formularz watchlisty
  const [watchlistSymbolInput, setWatchlistSymbolInput] = useState("");
  const [watchlistSubmitting, setWatchlistSubmitting] = useState(false);

  // Odświeżanie danych portfela
  const refreshPortfolio = async () => {
    setRefreshing(true);
    try {
      const [portRes, watchRes] = await Promise.all([
        fetch("/api/portfolio"),
        fetch("/api/watchlist"),
      ]);

      if (portRes.ok) {
        const portData = await portRes.json();
        setPortfolio(portData.data);
      }

      if (watchRes.ok) {
        const watchData = await watchRes.json();
        setWatchlist(watchData.data);
      }

      // Jeśli aktywna jest zakładka historii, odśwież również historię
      if (activeTab === "trades") {
        fetchTradeHistory();
      } else if (activeTab === "cash") {
        fetchCashHistory();
      }
    } catch {
      setNotification({
        type: "error",
        message: "Błąd podczas odświeżania danych portfela.",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const fetchTradeHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/portfolio/trades");
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchCashHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/portfolio/cash");
      if (res.ok) {
        const data = await res.json();
        setCashTransactions(data.transactions || []);
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === "trades") {
      fetchTradeHistory();
    } else if (tab === "cash") {
      fetchCashHistory();
    }
  };

  // Otwarcie modalu handlu z domyślnym symbolem i opcjonalnym typem
  const openTradeModal = (symbol = "", type: "BUY" | "SELL" = "BUY", defaultPrice = "") => {
    setTradeType(type);
    setTradeSymbol(symbol);
    setTradeQuantity("");
    setTradePrice(defaultPrice);
    setTradeFee("0");
    setTradeNotes("");
    setTradeError(null);
    setTradeModalOpen(true);
  };

  // Wykonanie transakcji
  const handleExecuteTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setTradeSubmitting(true);
    setTradeError(null);

    try {
      const qty = parseFloat(tradeQuantity);
      const prc = parseFloat(tradePrice);
      const fee = parseFloat(tradeFee || "0");

      if (isNaN(qty) || qty <= 0) {
        throw new Error("Ilość musi być większa od zera.");
      }
      if (isNaN(prc) || prc <= 0) {
        throw new Error("Cena musi być większa od zera.");
      }

      const res = await fetch("/api/portfolio/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: tradeSymbol.trim().toUpperCase(),
          type: tradeType,
          quantity: qty,
          price: prc,
          fee: isNaN(fee) ? 0 : fee,
          notes: tradeNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Wystąpił błąd podczas realizacji transakcji.");
      }

      setTradeModalOpen(false);
      setNotification({
        type: "success",
        message: `Pomyślnie zrealizowano zlecenie: ${tradeType === "BUY" ? "Kupno" : "Sprzedaż"} ${qty} ${tradeSymbol.toUpperCase()}`,
      });
      await refreshPortfolio();
    } catch (err) {
      setTradeError(err instanceof Error ? err.message : "Nieoczekiwany błąd.");
    } finally {
      setTradeSubmitting(false);
    }
  };

  // Wykonanie operacji gotówkowej
  const handleExecuteCash = async (e: React.FormEvent) => {
    e.preventDefault();
    setCashSubmitting(true);
    setCashError(null);

    try {
      const amt = parseFloat(cashAmount);
      if (isNaN(amt) || amt <= 0) {
        throw new Error("Kwota operacji musi być większa od zera.");
      }

      const res = await fetch("/api/portfolio/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: cashOpType,
          amount: amt,
          description: cashDescription.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Wystąpił błąd podczas operacji gotówkowej.");
      }

      setCashModalOpen(false);
      setNotification({
        type: "success",
        message: `Pomyślnie zrealizowano operację: ${cashOpType} kwoty ${amt.toFixed(2)} ${portfolio.currency}`,
      });
      await refreshPortfolio();
    } catch (err) {
      setCashError(err instanceof Error ? err.message : "Nieoczekiwany błąd.");
    } finally {
      setCashSubmitting(false);
    }
  };

  // Usunięcie pozycji (IDOR protected)
  const handleDeletePosition = async (positionId: string, symbol: string) => {
    if (!confirm(`Czy na pewno chcesz usunąć wpis pozycji dla ${symbol}? Spowoduje to wyzerowanie stanu tej pozycji.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/portfolio/positions/${positionId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Nie udało się usunąć pozycji.");
      }

      setNotification({
        type: "success",
        message: `Pozycja ${symbol} została usunięta.`,
      });
      await refreshPortfolio();
    } catch (err) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Błąd usuwania pozycji.",
      });
    }
  };

  // Dodanie do watchlisty
  const handleAddToWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!watchlistSymbolInput.trim()) return;

    setWatchlistSubmitting(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: watchlistSymbolInput.trim().toUpperCase() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Nie udało się dodać do obserwowanych.");
      }

      setWatchlistSymbolInput("");
      setNotification({
        type: "success",
        message: `Dodano ${watchlistSymbolInput.toUpperCase()} do obserwowanych.`,
      });
      await refreshPortfolio();
    } catch (err) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Błąd dodawania do obserwowanych.",
      });
    } finally {
      setWatchlistSubmitting(false);
    }
  };

  // Usunięcie z watchlisty
  const handleRemoveFromWatchlist = async (symbol: string) => {
    try {
      const res = await fetch(`/api/watchlist/${symbol}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Nie udało się usunąć z obserwowanych.");
      }

      setNotification({
        type: "success",
        message: `Usunięto ${symbol} z obserwowanych.`,
      });
      await refreshPortfolio();
    } catch (err) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Błąd usuwania z obserwowanych.",
      });
    }
  };

  // Kolorowanie wskaźnika ryzyka portfela (0-30 emerald, 31-69 amber, 70-100 rose)
  const getRiskColor = (score: number) => {
    if (score < 30) return "text-emerald-400 bg-emerald-950/60 border-emerald-800/80";
    if (score < 70) return "text-amber-400 bg-amber-950/60 border-amber-800/80";
    return "text-rose-400 bg-rose-950/60 border-rose-800/80";
  };

  // Obliczenie wagi gotówki w portfelu
  const cashWeightPercent =
    portfolio.totalValue > 0
      ? Math.round((portfolio.cashBalance / portfolio.totalValue) * 1000) / 10
      : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Pasek nawigacyjny */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40 px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Briefcase className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wider uppercase text-slate-100">
                Portfel Inwestycyjny
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-950 text-blue-400 border border-blue-800/80 uppercase">
                {portfolio.currency}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 hidden sm:block">
              Wycena rynkowa, audyt transakcji, księga gotówki i ważone ryzyko AI
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => openTradeModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nowa Transakcja</span>
          </button>

          <button
            onClick={() => {
              setCashAmount("");
              setCashDescription("");
              setCashError(null);
              setCashModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Gotówka</span>
          </button>

          <button
            onClick={refreshPortfolio}
            disabled={refreshing}
            className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Odśwież dane portfela"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

          <Link
            href="/predictions"
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors hidden md:inline"
          >
            Prognozy
          </Link>
          <Link
            href="/markets"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors hidden md:inline"
          >
            Rynki
          </Link>

          <div className="hidden sm:flex flex-col text-right border-l border-slate-800 pl-3">
            <span className="text-xs font-medium text-slate-200">{currentUser.displayName}</span>
            <span className="text-[10px] text-slate-400 font-mono">{currentUser.email}</span>
          </div>
        </div>
      </header>

      {/* Główna treść */}
      <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Powiadomienie */}
        {notification && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
              notification.type === "success"
                ? "bg-emerald-950/50 border-emerald-800/80 text-emerald-300"
                : "bg-red-950/50 border-red-800/80 text-red-300"
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === "success" ? (
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Globalne ostrzeżenie o wysokim ryzyku lub koncentracji */}
        {portfolio.isHighRiskWarning && (
          <div className="p-4 rounded-2xl border border-rose-800/80 bg-rose-950/40 text-rose-300 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <p className="font-semibold text-rose-200">
                Ostrzeżenie o podwyższonym ryzyku portfela
              </p>
              <p className="text-rose-300/80 leading-relaxed">
                Portfel posiada wskaźnik ryzyka &ge; 70 lub zidentyfikowano pozycję przekraczającą 15%
                alokacji kapitału o wysokim scoringu ryzyka AI (&ge; 70). Zaleca się dywersyfikację lub
                zwiększenie buforu gotówkowego.
              </p>
            </div>
          </div>
        )}

        {/* Hero Cards: 4 kluczowe metryki */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Wartość Całkowita */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">Wartość Całkowita</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono tracking-tight text-white">
                ${portfolio.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span>Akcje: ${portfolio.equityValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                <span>•</span>
                <span>Gotówka: ${portfolio.cashBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Koszt nabycia: ${portfolio.totalCostBasis.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          </div>

          {/* 2. P&L Niezrealizowany (Unrealized) */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">P&L Niezrealizowany</span>
              {portfolio.unrealizedPnL >= 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-rose-400" />
              )}
            </div>
            <div className="my-2">
              <div
                className={`text-2xl font-bold font-mono tracking-tight flex items-baseline gap-1.5 ${
                  portfolio.unrealizedPnL >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                <span>
                  {portfolio.unrealizedPnL >= 0 ? "+" : ""}
                  ${portfolio.unrealizedPnL.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-semibold">
                  ({portfolio.unrealizedPnLPercent >= 0 ? "+" : ""}
                  {portfolio.unrealizedPnLPercent.toFixed(2)}%)
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Otwarte pozycje akcyjne ({portfolio.positions.length})
              </div>
            </div>
            <div className="text-[10px] text-slate-500">
              Wycena rynkowa vs średnia cena zakupu
            </div>
          </div>

          {/* 3. P&L Zrealizowany (Realized) */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">P&L Zrealizowany</span>
              <History className="w-4 h-4 text-blue-400" />
            </div>
            <div className="my-2">
              <div
                className={`text-2xl font-bold font-mono tracking-tight ${
                  portfolio.realizedPnL >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {portfolio.realizedPnL >= 0 ? "+" : ""}
                ${portfolio.realizedPnL.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                <span>Łączny P&L:</span>
                <span
                  className={`font-semibold font-mono ${
                    portfolio.totalPnL >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {portfolio.totalPnL >= 0 ? "+" : ""}
                  ${portfolio.totalPnL.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div className="text-[10px] text-slate-500">
              Skumulowany zysk ze zrealizowanych transakcji SELL
            </div>
          </div>

          {/* 4. Portfolio Risk Score */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium">Ważony Portfolio Risk</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${getRiskColor(
                  portfolio.portfolioRiskScore
                )}`}
              >
                {portfolio.portfolioRiskScore} / 100
              </span>
            </div>
            <div className="my-2">
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden mt-2">
                <div
                  className={`h-full transition-all duration-500 ${
                    portfolio.portfolioRiskScore < 30
                      ? "bg-emerald-400"
                      : portfolio.portfolioRiskScore < 70
                      ? "bg-amber-400"
                      : "bg-rose-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, portfolio.portfolioRiskScore))}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-mono">
                <span>Niskie (&lt;30)</span>
                <span>Umiarkowane (30-69)</span>
                <span>Wysokie (&ge;70)</span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center justify-between">
              <span>Bufor gotówki: {cashWeightPercent}%</span>
              <span className="text-slate-500">Waga gotówki = 0</span>
            </div>
          </div>
        </div>

        {/* Pasek alokacji portfela (Allocation breakdown) */}
        {portfolio.totalValue > 0 && (
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-slate-400" />
                <span className="font-semibold text-slate-200">Struktura Alokacji Kapitału</span>
              </div>
              <span className="text-slate-400 font-mono text-[11px]">
                Pozycje: {portfolio.positions.length} | Gotówka: ${portfolio.cashBalance.toFixed(2)}
              </span>
            </div>

            {/* Segmentowy pasek alokacji */}
            <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden flex">
              {portfolio.positions.map((pos, idx) => {
                const colors = [
                  "bg-blue-500",
                  "bg-indigo-500",
                  "bg-purple-500",
                  "bg-teal-500",
                  "bg-cyan-500",
                  "bg-amber-500",
                ];
                const color = colors[idx % colors.length];
                return (
                  <div
                    key={pos.id}
                    className={`${color} h-full transition-all`}
                    style={{ width: `${pos.weightPercent}%` }}
                    title={`${pos.symbol}: ${pos.weightPercent}% ($${pos.marketValue.toFixed(2)})`}
                  />
                );
              })}
              {cashWeightPercent > 0 && (
                <div
                  className="bg-emerald-500/80 h-full transition-all"
                  style={{ width: `${cashWeightPercent}%` }}
                  title={`Gotówka: ${cashWeightPercent}% ($${portfolio.cashBalance.toFixed(2)})`}
                />
              )}
            </div>

            {/* Legenda alokacji */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] pt-1">
              {portfolio.positions.map((pos, idx) => {
                const dotColors = [
                  "bg-blue-500",
                  "bg-indigo-500",
                  "bg-purple-500",
                  "bg-teal-500",
                  "bg-cyan-500",
                  "bg-amber-500",
                ];
                return (
                  <div key={pos.id} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${dotColors[idx % dotColors.length]}`} />
                    <span className="font-semibold text-slate-200">{pos.symbol}</span>
                    <span className="text-slate-400 font-mono">{pos.weightPercent}%</span>
                  </div>
                );
              })}
              {cashWeightPercent > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  <span className="font-semibold text-slate-200">Gotówka</span>
                  <span className="text-slate-400 font-mono">{cashWeightPercent}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Zakładki nawigacyjne w portfelu */}
        <div className="border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTabChange("positions")}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "positions"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <List className="w-4 h-4" />
              <span>Pozycje Aktywne ({portfolio.positions.length})</span>
            </button>

            <button
              onClick={() => handleTabChange("trades")}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "trades"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <History className="w-4 h-4" />
              <span>Dziennik Transakcji</span>
            </button>

            <button
              onClick={() => handleTabChange("cash")}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "cash"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Wallet className="w-4 h-4" />
              <span>Księga Gotówki</span>
            </button>

            <button
              onClick={() => handleTabChange("watchlist")}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "watchlist"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>Obserwowane ({watchlist.length})</span>
            </button>
          </div>
        </div>

        {/* TAB 1: Pozycje Aktywne */}
        {activeTab === "positions" && (
          <div className="space-y-4">
            {portfolio.positions.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                <Briefcase className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-sm font-semibold text-slate-200">
                  Brak otwartych pozycji w portfelu
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Twój portfel jest obecnie pusty. Dodaj nową transakcję zakupu akcji lub wybierz spółki z
                  obserwowanych.
                </p>
                <button
                  onClick={() => openTradeModal()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer mt-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Dodaj pierwszą transakcję</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider">
                      <th className="py-3.5 px-4">Instrument</th>
                      <th className="py-3.5 px-3 text-right">Alokacja</th>
                      <th className="py-3.5 px-3 text-right">Ilość</th>
                      <th className="py-3.5 px-3 text-right">Śr. Zakup</th>
                      <th className="py-3.5 px-3 text-right">Kurs</th>
                      <th className="py-3.5 px-3 text-right">Wartość</th>
                      <th className="py-3.5 px-3 text-right">P&L Niezrealizowany</th>
                      <th className="py-3.5 px-3 text-right">P&L Zrealizowany</th>
                      <th className="py-3.5 px-3 text-center">AI Scoring</th>
                      <th className="py-3.5 px-4 text-center">Akcje</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-mono">
                    {portfolio.positions.map((pos) => {
                      const isUnrealizedProfitable = pos.unrealizedPnL >= 0;
                      return (
                        <tr
                          key={pos.id}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            pos.isConcentratedRiskWarning ? "bg-rose-950/20" : ""
                          }`}
                        >
                          {/* Instrument & Name */}
                          <td className="py-3 px-4 font-sans">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/assets/${pos.symbol}`}
                                className="font-bold text-slate-100 hover:text-blue-400 transition-colors flex items-center gap-1"
                              >
                                {pos.symbol}
                                <ArrowUpRight className="w-3 h-3 text-slate-500" />
                              </Link>
                              {pos.isConcentratedRiskWarning && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-950 text-rose-300 border border-rose-800"
                                  title="Koncentracja >15% przy Risk Score >= 70"
                                >
                                  Koncentracja
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[140px]">
                              {pos.name}
                            </div>
                          </td>

                          {/* Alokacja % */}
                          <td className="py-3 px-3 text-right">
                            <span className="font-semibold text-slate-200">
                              {pos.weightPercent}%
                            </span>
                          </td>

                          {/* Ilość */}
                          <td className="py-3 px-3 text-right text-slate-200">
                            {pos.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                          </td>

                          {/* Średnia cena zakupu */}
                          <td className="py-3 px-3 text-right text-slate-300">
                            ${pos.averageBuyPrice.toFixed(2)}
                          </td>

                          {/* Aktualny kurs */}
                          <td className="py-3 px-3 text-right font-bold text-slate-100">
                            ${pos.currentPrice.toFixed(2)}
                          </td>

                          {/* Wartość rynkowa */}
                          <td className="py-3 px-3 text-right font-semibold text-slate-100">
                            ${pos.marketValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* Niezrealizowany PnL */}
                          <td className="py-3 px-3 text-right">
                            <div
                              className={`font-semibold ${
                                isUnrealizedProfitable ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {isUnrealizedProfitable ? "+" : ""}
                              ${pos.unrealizedPnL.toFixed(2)}
                            </div>
                            <div
                              className={`text-[10px] ${
                                isUnrealizedProfitable ? "text-emerald-400/80" : "text-rose-400/80"
                              }`}
                            >
                              {isUnrealizedProfitable ? "+" : ""}
                              {pos.unrealizedPnLPercent.toFixed(2)}%
                            </div>
                          </td>

                          {/* Zrealizowany PnL */}
                          <td className="py-3 px-3 text-right">
                            <span
                              className={`${
                                pos.realizedPnL >= 0 ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {pos.realizedPnL >= 0 ? "+" : ""}
                              ${pos.realizedPnL.toFixed(2)}
                            </span>
                          </td>

                          {/* AI Scoring (Opp / Risk / Dir) */}
                          <td className="py-3 px-3 text-center font-sans">
                            {pos.signal ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="flex items-center gap-1 text-[10px] font-mono">
                                  <span className="text-emerald-400" title="Opportunity Score">
                                    O:{pos.signal.opportunityScore}
                                  </span>
                                  <span className="text-slate-600">|</span>
                                  <span
                                    className={
                                      pos.signal.riskScore >= 70 ? "text-rose-400 font-bold" : "text-amber-400"
                                    }
                                    title="Risk Score"
                                  >
                                    R:{pos.signal.riskScore}
                                  </span>
                                </div>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase ${
                                    pos.signal.direction === "POSITIVE"
                                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                      : pos.signal.direction === "NEGATIVE"
                                      ? "bg-rose-950 text-rose-400 border border-rose-800"
                                      : "bg-slate-800 text-slate-300"
                                  }`}
                                >
                                  {pos.signal.direction}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-600 text-[10px]">—</span>
                            )}
                          </td>

                          {/* Akcje */}
                          <td className="py-3 px-4 text-center font-sans">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => openTradeModal(pos.symbol, "BUY", pos.currentPrice.toString())}
                                className="p-1 rounded bg-slate-800 hover:bg-emerald-950 hover:text-emerald-300 text-slate-300 transition-colors"
                                title={`Dokup ${pos.symbol}`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => openTradeModal(pos.symbol, "SELL", pos.currentPrice.toString())}
                                className="p-1 rounded bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-300 transition-colors"
                                title={`Sprzedaj ${pos.symbol}`}
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeletePosition(pos.id, pos.symbol)}
                                className="p-1 rounded bg-slate-800 hover:bg-red-950 hover:text-red-400 text-slate-400 transition-colors"
                                title="Usuń błędną pozycję"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Dziennik Transakcji (Trade Audit Log) */}
        {activeTab === "trades" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <p>Niezmienny audyt wszystkich operacji kupna i sprzedaży w portfelu</p>
              <button
                onClick={fetchTradeHistory}
                disabled={loadingHistory}
                className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? "animate-spin" : ""}`} />
                <span>Odśwież historię</span>
              </button>
            </div>

            {loadingHistory ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                Ładowanie historii transakcji...
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 text-xs text-slate-400">
                Brak zarejestrowanych transakcji w historii.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider font-mono">
                      <th className="py-3 px-4">Data i czas</th>
                      <th className="py-3 px-3">Typ</th>
                      <th className="py-3 px-3">Symbol</th>
                      <th className="py-3 px-3 text-right">Ilość</th>
                      <th className="py-3 px-3 text-right">Cena</th>
                      <th className="py-3 px-3 text-right">Wartość łączna</th>
                      <th className="py-3 px-3 text-right">Prowizja</th>
                      <th className="py-3 px-4">Notatka</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-mono">
                    {transactions.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {new Date(t.executedAt).toLocaleString("pl-PL")}
                        </td>
                        <td className="py-3 px-3 font-sans">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              t.type === "BUY"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : "bg-rose-950 text-rose-400 border border-rose-800"
                            }`}
                          >
                            {t.type === "BUY" ? "Kupno" : "Sprzedaż"}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-200">
                          {t.assetSymbol}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-200">
                          {t.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-300">
                          ${t.price.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-slate-100">
                          ${t.totalValue.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-400">
                          ${t.fee.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-400 text-[11px]">
                          {t.notes || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Księga Gotówki (Cash Ledger) */}
        {activeTab === "cash" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <p>
                Księga operacji gotówkowych (Cash Ledger) z saldem wyliczanym po stronie serwera
              </p>
              <button
                onClick={fetchCashHistory}
                disabled={loadingHistory}
                className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? "animate-spin" : ""}`} />
                <span>Odśwież księgę</span>
              </button>
            </div>

            {loadingHistory ? (
              <div className="p-12 text-center text-slate-500 text-xs">
                Ładowanie księgi gotówkowej...
              </div>
            ) : cashTransactions.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 text-xs text-slate-400">
                Brak operacji w księdze gotówkowej.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider font-mono">
                      <th className="py-3 px-4">Data</th>
                      <th className="py-3 px-3">Typ operacji</th>
                      <th className="py-3 px-3 text-right">Kwota</th>
                      <th className="py-3 px-3 text-right">Saldo po operacji</th>
                      <th className="py-3 px-4">Opis zdarzenia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 font-mono">
                    {cashTransactions.map((c) => {
                      const isInflow = c.type === "DEPOSIT" || c.type === "SELL";
                      return (
                        <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 text-slate-400 text-[11px]">
                            {new Date(c.createdAt).toLocaleString("pl-PL")}
                          </td>
                          <td className="py-3 px-3 font-sans">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                              {c.type}
                            </span>
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-bold ${
                              isInflow ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {isInflow ? "+" : "-"}${c.amount.toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-slate-200">
                            ${c.balanceAfter.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 font-sans text-slate-400 text-[11px]">
                            {c.description || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Obserwowane (Watchlist) */}
        {activeTab === "watchlist" && (
          <div className="space-y-4">
            {/* Formularz dodawania do Watchlisty */}
            <form
              onSubmit={handleAddToWatchlist}
              className="flex items-center gap-2 p-3 rounded-2xl bg-slate-900/60 border border-slate-800 max-w-md"
            >
              <Search className="w-4 h-4 text-slate-400 ml-2" />
              <input
                type="text"
                placeholder="Wpisz ticker (np. NVDA, MSFT, AAPL)"
                value={watchlistSymbolInput}
                onChange={(e) => setWatchlistSymbolInput(e.target.value.toUpperCase())}
                className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none uppercase font-mono"
              />
              <button
                type="submit"
                disabled={watchlistSubmitting || !watchlistSymbolInput.trim()}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {watchlistSubmitting ? "Dodawanie..." : "Obserwuj"}
              </button>
            </form>

            {watchlist.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/80 text-xs text-slate-400 space-y-2">
                <Eye className="w-8 h-8 text-slate-600 mx-auto" />
                <p>Brak obserwowanych spółek na liście.</p>
                <p className="text-[11px] text-slate-500">
                  Użyj powyższego pola, aby monitorować notowania i sygnały AI interesujących spółek.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {watchlist.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/assets/${item.symbol}`}
                            className="font-bold text-sm text-slate-100 hover:text-blue-400 transition-colors"
                          >
                            {item.symbol}
                          </Link>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {item.currency}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate max-w-[200px]">
                          {item.name}
                        </p>
                      </div>

                      <button
                        onClick={() => handleRemoveFromWatchlist(item.symbol)}
                        className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                        title="Usuń z obserwowanych"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-baseline justify-between pt-1">
                      <div className="text-xl font-bold font-mono text-white">
                        ${item.currentPrice.toFixed(2)}
                      </div>
                      <div
                        className={`text-xs font-semibold font-mono flex items-center gap-0.5 ${
                          item.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {item.changePercent >= 0 ? "+" : ""}
                        {item.changePercent.toFixed(2)}%
                      </div>
                    </div>

                    {/* AI Scoring badge */}
                    {item.opportunityScore !== null && item.riskScore !== null && (
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400">
                            Opp: {item.opportunityScore}
                          </span>
                          <span className="text-slate-700">|</span>
                          <span
                            className={
                              item.riskScore >= 70 ? "text-rose-400 font-bold" : "text-amber-400"
                            }
                          >
                            Risk: {item.riskScore}
                          </span>
                        </div>
                        {item.direction && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                              item.direction === "POSITIVE"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : item.direction === "NEGATIVE"
                                ? "bg-rose-950 text-rose-400 border border-rose-800"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {item.direction}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="pt-1 flex items-center justify-between">
                      <button
                        onClick={() =>
                          openTradeModal(item.symbol, "BUY", item.currentPrice.toString())
                        }
                        className="w-full py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Kup do portfela</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL 1: Transakcja (Kupno / Sprzedaż) */}
      {tradeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    tradeType === "BUY"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-rose-500/20 text-rose-400"
                  }`}
                >
                  {tradeType === "BUY" ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {tradeType === "BUY" ? "Zlecenie Kupna" : "Zlecenie Sprzedaży"}
                  </h3>
                  <p className="text-[10px] text-slate-400">Rejestracja w audycie transakcji</p>
                </div>
              </div>
              <button
                onClick={() => setTradeModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Przełącznik Kupno / Sprzedaż */}
            <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setTradeType("BUY")}
                className={`py-1.5 font-semibold rounded-lg transition-colors cursor-pointer ${
                  tradeType === "BUY"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                KUPNO (BUY)
              </button>
              <button
                type="button"
                onClick={() => setTradeType("SELL")}
                className={`py-1.5 font-semibold rounded-lg transition-colors cursor-pointer ${
                  tradeType === "SELL"
                    ? "bg-rose-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                SPRZEDAŻ (SELL)
              </button>
            </div>

            {tradeError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{tradeError}</span>
              </div>
            )}

            <form onSubmit={handleExecuteTrade} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Symbol Aktywa (Ticker)
                </label>
                <input
                  type="text"
                  required
                  placeholder="np. AAPL, NVDA, TSLA"
                  value={tradeSymbol}
                  onChange={(e) => setTradeSymbol(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono uppercase focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Liczba akcji (Quantity)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="0.000001"
                    placeholder="np. 10"
                    value={tradeQuantity}
                    onChange={(e) => setTradeQuantity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Cena jednostkowa ({portfolio.currency})
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="0.0001"
                    placeholder="np. 185.50"
                    value={tradePrice}
                    onChange={(e) => setTradePrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Prowizja / Opłata ({portfolio.currency})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    value={tradeFee}
                    onChange={(e) => setTradeFee(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Łączna kwota transakcji
                  </label>
                  <div className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800/80 text-white font-mono font-semibold text-right">
                    $
                    {(
                      (parseFloat(tradeQuantity || "0") * parseFloat(tradePrice || "0") || 0) +
                      (tradeType === "BUY" ? parseFloat(tradeFee || "0") : -parseFloat(tradeFee || "0"))
                    ).toFixed(2)}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Notatka / Teza inwestycyjna (opcjonalnie)
                </label>
                <input
                  type="text"
                  placeholder="np. Realizacja zysku, rebalancing, dopłata z dywidendy"
                  value={tradeNotes}
                  onChange={(e) => setTradeNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTradeModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={tradeSubmitting}
                  className={`px-5 py-2 rounded-xl text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer ${
                    tradeType === "BUY"
                      ? "bg-emerald-600 hover:bg-emerald-500"
                      : "bg-rose-600 hover:bg-rose-500"
                  }`}
                >
                  {tradeSubmitting ? "Przetwarzanie..." : tradeType === "BUY" ? "Potwierdź Kupno" : "Potwierdź Sprzedaż"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Operacja Gotówkowa */}
      {cashModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Zarządzanie Gotówką</h3>
                  <p className="text-[10px] text-slate-400">
                    Aktualne saldo: ${portfolio.cashBalance.toFixed(2)} {portfolio.currency}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCashModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Przełącznik operacji */}
            <div className="grid grid-cols-3 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setCashOpType("DEPOSIT")}
                className={`py-1.5 font-semibold rounded-lg transition-colors cursor-pointer ${
                  cashOpType === "DEPOSIT"
                    ? "bg-emerald-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Wpłata
              </button>
              <button
                type="button"
                onClick={() => setCashOpType("WITHDRAWAL")}
                className={`py-1.5 font-semibold rounded-lg transition-colors cursor-pointer ${
                  cashOpType === "WITHDRAWAL"
                    ? "bg-rose-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Wypłata
              </button>
              <button
                type="button"
                onClick={() => setCashOpType("ADJUSTMENT")}
                className={`py-1.5 font-semibold rounded-lg transition-colors cursor-pointer ${
                  cashOpType === "ADJUSTMENT"
                    ? "bg-amber-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Korekta
              </button>
            </div>

            {cashError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{cashError}</span>
              </div>
            )}

            <form onSubmit={handleExecuteCash} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  {cashOpType === "ADJUSTMENT"
                    ? `Nowe docelowe saldo (${portfolio.currency})`
                    : `Kwota operacji (${portfolio.currency})`}
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  min="0.01"
                  placeholder="np. 5000.00"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Tytuł / Opis operacji
                </label>
                <input
                  type="text"
                  placeholder="np. Zasilenie rachunku, przelew bankowy"
                  value={cashDescription}
                  onChange={(e) => setCashDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCashModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={cashSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {cashSubmitting ? "Zapisywanie..." : "Zatwierdź operację"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
