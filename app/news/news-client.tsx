"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Newspaper,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Search,
  ExternalLink,
  Layers,
  Sparkles,
} from "lucide-react";
import { SourceTier, NewsSecurityStatus } from "@prisma/client";

interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  content: string | null;
  source: string;
  sourceUrl: string | null;
  sourceTier: SourceTier;
  sourceReliabilityScore: number;
  sentimentScore: number | null;
  securityStatus: NewsSecurityStatus;
  isFlagged: boolean;
  flagReason: string | null;
  publishedAt: string | Date;
  duplicateOf?: {
    id: string;
    title: string;
    source: string;
  } | null;
  newsAssets: {
    asset: {
      id: string;
      symbol: string;
      name: string;
    };
    relevance: number;
    sentiment: number | null;
    confidence: number;
  }[];
}

interface Props {
  initialNews: {
    items: unknown[];
    total: number;
    page: number;
    totalPages: number;
  };
}

export default function NewsClient({ initialNews }: Props) {
  const [items, setItems] = useState<NewsItem[]>(initialNews.items as unknown as NewsItem[]);
  const [total, setTotal] = useState(initialNews.total);
  const [page, setPage] = useState(initialNews.page);
  const [totalPages, setTotalPages] = useState(initialNews.totalPages);

  const [selectedTier, setSelectedTier] = useState<string>("ALL");
  const [selectedSentiment, setSelectedSentiment] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchNews = async (
    newPage = page,
    tier = selectedTier,
    sentiment = selectedSentiment,
    query = searchQuery
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(newPage));
      params.set("limit", "20");

      if (tier !== "ALL") params.set("tier", tier);
      if (sentiment !== "ALL") params.set("sentiment", sentiment);
      if (query.trim()) params.set("q", query.trim());

      const res = await fetch(`/api/news?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
        setTotalPages(data.totalPages);
      }
    } catch (err) {
      console.error("Błąd pobierania wiadomości:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleTierFilter = (tier: string) => {
    setSelectedTier(tier);
    fetchNews(1, tier, selectedSentiment, searchQuery);
  };

  const handleSentimentFilter = (sent: string) => {
    setSelectedSentiment(sent);
    fetchNews(1, selectedTier, sent, searchQuery);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchNews(1, selectedTier, selectedSentiment, searchQuery);
  };

  const handleTriggerIngest = async () => {
    setActionLoading(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ingest" }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Pobrano feedy: +${data.result.totalAdded} nowych, ${data.result.totalSkipped} duplikatów.`);
        fetchNews(1);
      } else {
        setActionMsg(`Błąd: ${data.error}`);
      }
    } catch {
      setActionMsg("Błąd sieci podczas pobierania feedów.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerAI = async () => {
    setActionLoading(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process", batchSize: 5 }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Przetworzono AI: ${data.result.processed} artykułów, ${data.result.errors} błędów.`);
        fetchNews(page);
      } else {
        setActionMsg(`Błąd: ${data.error}`);
      }
    } catch {
      setActionMsg("Błąd sieci podczas przetwarzania AI.");
    } finally {
      setActionLoading(false);
    }
  };

  const getTierBadge = (tier: SourceTier, score: number) => {
    switch (tier) {
      case SourceTier.PRIMARY:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800">
            PRIMARY ({score}%)
          </span>
        );
      case SourceTier.SECONDARY:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-950/80 text-blue-400 border border-blue-800">
            SECONDARY ({score}%)
          </span>
        );
      case SourceTier.UNVERIFIED:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800">
            UNVERIFIED ({score}%)
          </span>
        );
    }
  };

  const getSentimentBadge = (val: number | null) => {
    if (val === null) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
          <Minus className="w-3.5 h-3.5 text-slate-500" /> Oczekuje na AI
        </span>
      );
    }

    const num = Number(val);
    if (num >= 0.2) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/60">
          <TrendingUp className="w-3.5 h-3.5" /> +{num.toFixed(2)} Bullish
        </span>
      );
    }
    if (num <= -0.2) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-950/60 px-2 py-0.5 rounded-md border border-red-800/60">
          <TrendingDown className="w-3.5 h-3.5" /> {num.toFixed(2)} Bearish
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-700/60">
        <Minus className="w-3.5 h-3.5 text-slate-400" /> {num.toFixed(2)} Neutral
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Nagłówek */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-900/30 border border-blue-800/50 rounded-xl text-blue-400">
                <Newspaper className="w-6 h-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Silnik Wiadomości i Analizy Rynku
              </h1>
            </div>
            <p className="text-slate-400 text-sm mt-1">
              Agregacja wieloźródłowa z tarczą Prompt Injection Shield (OWASP) i deduplikacją SimHash.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleTriggerIngest}
              disabled={actionLoading}
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? "animate-spin" : ""}`} />
              Pobierz Feedy
            </button>
            <button
              onClick={handleTriggerAI}
              disabled={actionLoading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-3.5 py-2 rounded-xl text-xs font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Uruchom AI
            </button>
          </div>
        </div>

        {actionMsg && (
          <div className="p-3.5 bg-blue-950/50 border border-blue-800/60 rounded-xl text-xs text-blue-300">
            {actionMsg}
          </div>
        )}

        {/* Pasek filtrów */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
          {/* Wyszukiwarka */}
          <form onSubmit={handleSearch} className="md:col-span-4 relative">
            <input
              type="text"
              placeholder="Szukaj w tytule lub treści..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
          </form>

          {/* Filtry Tier */}
          <div className="md:col-span-4 flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[11px] uppercase font-semibold text-slate-400 mr-1">Źródło:</span>
            {["ALL", "PRIMARY", "SECONDARY", "UNVERIFIED"].map((t) => (
              <button
                key={t}
                onClick={() => handleTierFilter(t)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                  selectedTier === t
                    ? "bg-blue-600 text-white"
                    : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Filtry Sentyment */}
          <div className="md:col-span-4 flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[11px] uppercase font-semibold text-slate-400 mr-1">Nastrój:</span>
            {[
              { id: "ALL", label: "Wszystkie" },
              { id: "bullish", label: "Bullish" },
              { id: "neutral", label: "Neutral" },
              { id: "bearish", label: "Bearish" },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => handleSentimentFilter(s.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                  selectedSentiment === s.id
                    ? "bg-blue-600 text-white"
                    : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lista Artykułów */}
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
            Ładowanie strumienia wiadomości...
          </div>
        ) : items.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
            <Newspaper className="w-10 h-10 mx-auto mb-3 text-slate-600" />
            <p className="text-base font-semibold text-slate-300">Brak artykułów spełniających kryteria</p>
            <p className="text-xs text-slate-500 mt-1">
              Kliknij przycisk &quot;Pobierz Feedy&quot;, aby zaimportować najnowsze depesze z aktywnych kanałów RSS.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((news) => (
              <div
                key={news.id}
                className={`bg-slate-900/90 border rounded-2xl p-5 transition-colors ${
                  news.isFlagged
                    ? "border-amber-700/60 bg-amber-950/10"
                    : "border-slate-800 hover:border-slate-700"
                }`}
              >
                {/* Górny pasek metadanych */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getTierBadge(news.sourceTier, news.sourceReliabilityScore)}
                    <span className="text-slate-400 font-medium">{news.source}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-400">
                      {new Date(news.publishedAt).toLocaleString("pl-PL", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {news.duplicateOf && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/60">
                        <Layers className="w-3 h-3" /> Przedruk z: {news.duplicateOf.source}
                      </span>
                    )}
                  </div>

                  <div>{getSentimentBadge(news.sentimentScore)}</div>
                </div>

                {/* Tytuł */}
                <h3 className="text-base sm:text-lg font-bold text-slate-100 mb-2 leading-snug">
                  {news.sourceUrl ? (
                    <a
                      href={news.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-400 transition-colors inline-flex items-center gap-1.5"
                    >
                      {news.title}
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500 inline" />
                    </a>
                  ) : (
                    news.title
                  )}
                </h3>

                {/* Podsumowanie */}
                {news.summary && (
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-3">
                    {news.summary}
                  </p>
                )}

                {/* Alert Ochrony Prompt Injection (jeśli artykuł został oflagowany przez heurystykę) */}
                {news.isFlagged && (
                  <div className="mb-3 p-3 bg-amber-950/60 border border-amber-800/80 rounded-xl text-xs text-amber-300 flex items-start gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Tarcza Bezpieczeństwa (Prompt Injection Shield): </span>
                      Treść została wykryta jako potencjalnie zawierająca próbę manipulacji modelem (zachowana w formie nienaruszonej do celów audytowych).
                      {news.flagReason && (
                        <div className="text-[11px] text-amber-400/80 mt-0.5 font-mono">
                          Powód: {news.flagReason}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Dolny pasek: powiązane symbole giełdowe */}
                {news.newsAssets && news.newsAssets.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-800/60">
                    <span className="text-[11px] uppercase font-semibold text-slate-400">
                      Powiązane instrumenty:
                    </span>
                    {news.newsAssets.map(({ asset, relevance, confidence }) => (
                      <Link
                        key={asset.id}
                        href={`/assets/${asset.symbol}`}
                        className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-slate-950 text-blue-400 border border-slate-800 hover:border-blue-700 transition-colors"
                      >
                        <span>${asset.symbol}</span>
                        <span className="text-slate-500 font-normal">
                          (rel: {Math.round(Number(relevance) * 100)}%, conf: {Math.round(Number(confidence) * 100)}%)
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Paginacja */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs">
            <span className="text-slate-400">
              Łącznie {total} artykułów (Strona {page} z {totalPages})
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => fetchNews(page - 1)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40 cursor-pointer"
              >
                Poprzednia
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => fetchNews(page + 1)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40 cursor-pointer"
              >
                Następna
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
