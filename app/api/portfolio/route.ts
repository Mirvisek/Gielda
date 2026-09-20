import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { portfolioService } from "@/lib/portfolio/portfolio-service";

export async function GET() {
  try {
    const user = await requireAuth();
    const summary = await portfolioService.getPortfolioSummary(user.id);
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd pobierania danych portfela.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
