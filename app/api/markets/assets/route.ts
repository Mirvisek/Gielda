import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { marketService } from "@/lib/market/market-service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("q") || "";

    const assets = await marketService.searchAssets(query);
    return NextResponse.json({ assets });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd autoryzacji.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
