import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { marketService } from "@/lib/market/market-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    await requireAuth();
    const { symbol } = await params;

    const [asset, quote] = await Promise.all([
      marketService.getOrCreateAsset(symbol),
      marketService.getQuote(symbol),
    ]);

    return NextResponse.json({ asset, quote });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd pobierania notowania.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
