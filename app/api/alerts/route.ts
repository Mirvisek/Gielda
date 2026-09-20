import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { alertService } from "@/lib/alerts/alert-service";
import { CreateAlertSchema } from "@/lib/alerts/types";

export async function GET() {
  try {
    const user = await requireAuth();
    const alerts = await alertService.getUserAlerts(user.id);
    return NextResponse.json({ success: true, data: alerts });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd pobierania alertów.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = CreateAlertSchema.parse(body);

    const alert = await alertService.createAlert(user.id, parsed);
    return NextResponse.json({ success: true, data: alert }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd tworzenia alertu.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
