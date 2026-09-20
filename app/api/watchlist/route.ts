import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { portfolioService } from "@/lib/portfolio/portfolio-service";
import { z } from "zod";

const AddWatchlistSchema = z.object({
  symbol: z
    .string()
    .min(1, "Symbol is required")
    .max(32, "Symbol is too long")
    .transform((s) => s.trim().toUpperCase()),
});

export async function GET() {
  try {
    const user = await requireAuth();
    const watchlist = await portfolioService.getWatchlist(user.id);
    return NextResponse.json({ success: true, data: watchlist });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd pobierania listy obserwowanych.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const { symbol } = AddWatchlistSchema.parse(body);

    const item = await portfolioService.addToWatchlist(user.id, symbol);
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd dodawania do obserwowanych.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
