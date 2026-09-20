import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { marketService } from "@/lib/market/market-service";
import { CandleInterval } from "@/lib/market/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    await requireAuth();
    const { symbol } = await params;

    const searchParams = req.nextUrl.searchParams;
    const interval = (searchParams.get("interval") as CandleInterval) || "1d";

    const indicators = await marketService.getTechnicalIndicators(symbol, interval);
    return NextResponse.json({ symbol: symbol.toUpperCase(), interval, indicators });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd kalkulacji wskaźników.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
