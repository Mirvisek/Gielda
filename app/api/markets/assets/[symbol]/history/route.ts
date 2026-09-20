import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { marketService } from "@/lib/market/market-service";
import { CandleInterval, HistoricalRange } from "@/lib/market/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    await requireAuth();
    const { symbol } = await params;

    const searchParams = req.nextUrl.searchParams;
    const interval = (searchParams.get("interval") as CandleInterval) || "1d";
    const range = (searchParams.get("range") as HistoricalRange) || "1m";

    const candles = await marketService.getHistoricalPrices(symbol, interval, range);
    return NextResponse.json({ symbol: symbol.toUpperCase(), interval, range, candles });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd pobierania historii.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
