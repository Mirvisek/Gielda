import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { alertService } from "@/lib/alerts/alert-service";

export async function POST() {
  try {
    await requireAuth();
    const result = await alertService.evaluateAlerts();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd ewaluacji alertów.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
