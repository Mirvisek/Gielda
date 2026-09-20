import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { portfolioService } from "@/lib/portfolio/portfolio-service";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const result = await portfolioService.deletePosition(user.id, id);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd usuwania pozycji.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
