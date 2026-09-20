import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { requireAdmin, AdminAuthorizationError } from "@/lib/admin/require-admin";
import { predictionService } from "@/lib/scoring/prediction-service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const searchParams = req.nextUrl.searchParams;
    const symbol = searchParams.get("symbol") || undefined;
    const direction = searchParams.get("direction") || undefined;
    const status = searchParams.get("status") || undefined;
    const resolution = (searchParams.get("resolution") as "ALL" | "SUCCESS" | "FAILURE" | "PENDING") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const includeStats = searchParams.get("stats") === "true";

    const [predictions, stats] = await Promise.all([
      predictionService.getPredictions({ symbol, direction, status, resolution, page, limit }),
      includeStats ? predictionService.getCalibrationStats() : Promise.resolve(null),
    ]);

    return NextResponse.json({
      ...predictions,
      calibrationStats: stats,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd pobierania prognoz.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST() {
  try {
    await requireAdmin();

    const result = await predictionService.evaluateMaturedPredictions();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const msg = error instanceof Error ? error.message : "Błąd ewaluacji prognoz.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
