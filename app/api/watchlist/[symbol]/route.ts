import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { portfolioService } from "@/lib/portfolio/portfolio-service";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const user = await requireAuth();
    const { symbol } = await params;

    const result = await portfolioService.removeFromWatchlist(user.id, symbol);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd usuwania z obserwowanych.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
