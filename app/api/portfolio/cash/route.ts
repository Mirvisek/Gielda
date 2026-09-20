import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { portfolioService } from "@/lib/portfolio/portfolio-service";
import { CashOperationSchema } from "@/lib/portfolio/types";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const result = await portfolioService.getCashTransactions(user.id, page, limit);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd pobierania operacji gotówkowych.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = CashOperationSchema.parse(body);

    const cashTx = await portfolioService.executeCashOperation(user.id, parsed);
    return NextResponse.json({ success: true, data: cashTx }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd operacji gotówkowej.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
