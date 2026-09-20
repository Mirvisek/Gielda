import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { marketService } from "@/lib/market/market-service";

export async function GET() {
  try {
    await requireAuth();
    const overview = await marketService.getMarketOverview();
    return NextResponse.json({ overview });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd autoryzacji.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
