import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { marketService, resolveMarketSymbol } from "@/lib/market/market-service";
import { newsService } from "@/lib/news/news-service";
import { signalService } from "@/lib/scoring/signal-service";
import AssetClient from "./asset-client";

export const dynamic = "force-dynamic";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const sessionData = await getCurrentSession();
  if (!sessionData || sessionData.user.status !== "ACTIVE") {
    redirect("/login");
  }

  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol).trim();
  const normSymbol = resolveMarketSymbol(decoded);

  // Jeśli użytkownik wpisał popularny alias (np. PKOBP lub ORLEN), przekieruj do kanonicznego tickera (PKO.WA, PKN.WA)
  if (normSymbol !== decoded.toUpperCase() && !decoded.includes(".")) {
    redirect(`/assets/${encodeURIComponent(normSymbol)}`);
  }

  try {
    await marketService.getOrCreateAsset(normSymbol).catch(() => null);

    const [quote, initialCandles, indicators, relatedNews, initialSignal] = await Promise.all([
      marketService.getQuote(normSymbol),
      marketService.getHistoricalPrices(normSymbol, "1d", "1m"),
      marketService.getTechnicalIndicators(normSymbol, "1d"),
      newsService.getNewsForAsset(normSymbol, 5),
      signalService.getOrGenerateSignal(normSymbol).catch(() => null),
    ]);

    return (
      <AssetClient
        symbol={normSymbol}
        initialQuote={quote}
        initialCandles={initialCandles}
        initialIndicators={indicators}
        initialNews={relatedNews}
        initialSignal={initialSignal}
      />
    );
  } catch (error) {
    console.error(`[AssetPage Error for ${normSymbol}]:`, error);
    // Zwróć fallback UI z błędem pobrania
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-8 flex flex-col items-center justify-center space-y-4">
        <h2 className="text-lg font-bold text-red-400">Błąd pobierania danych dla {normSymbol}</h2>
        <p className="text-xs text-slate-400">
          Upewnij się, że symbol jest poprawny lub spróbuj ponownie za chwilę.
        </p>
        <a
          href="/markets"
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs rounded-xl transition-colors"
        >
          ← Wróć do rynków
        </a>
      </div>
    );
  }
}
