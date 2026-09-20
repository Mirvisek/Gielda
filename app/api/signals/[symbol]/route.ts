import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { signalService } from "@/lib/scoring/signal-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    await requireAuth();
    const { symbol } = await params;
    const searchParams = req.nextUrl.searchParams;
    const forceRefresh = searchParams.get("refresh") === "true";

    const signal = await signalService.getOrGenerateSignal(symbol, forceRefresh);
    return NextResponse.json({ signal });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd generowania sygnału.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    await requireAuth();
    const { symbol } = await params;

    const signal = await signalService.getOrGenerateSignal(symbol, true);
    return NextResponse.json({ success: true, signal });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd przeliczania sygnału.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
