import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { requireAdmin } from "@/lib/admin/require-admin";
import { newsService } from "@/lib/news/news-service";
import { NewsSecurityStatus, SourceTier } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const searchParams = req.nextUrl.searchParams;
    const tier = searchParams.get("tier") as SourceTier | null;
    const symbol = searchParams.get("symbol") || undefined;
    const sentiment = searchParams.get("sentiment") as "bullish" | "bearish" | "neutral" | null;
    const securityStatus = searchParams.get("securityStatus") as NewsSecurityStatus | null;
    const search = searchParams.get("q") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const result = await newsService.getNews({
      tier: tier || undefined,
      symbol,
      sentiment: sentiment || undefined,
      securityStatus: securityStatus || undefined,
      search,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd pobierania wiadomości.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/**
 * POST /api/news — Wymuszenie pobrania źródeł RSS lub uruchomienia przetwarzania AI (Tylko Admin).
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json().catch(() => ({}));
    const action = body.action || "ingest";

    if (action === "ingest") {
      const result = await newsService.ingestAllActiveSources();
      return NextResponse.json({ success: true, result });
    }

    if (action === "process") {
      const batchSize = body.batchSize || 5;
      const result = await newsService.processPendingNewsBatch(batchSize);
      return NextResponse.json({ success: true, result });
    }

    return NextResponse.json({ error: "Nieznana akcja. Dostępne: ingest, process" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd przetwarzania żądania.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
