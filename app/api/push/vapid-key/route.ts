import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { pushService } from "@/lib/alerts/push-service";

export async function GET() {
  try {
    await requireAuth();
    const publicKey = pushService.getVapidPublicKey();
    return NextResponse.json({ success: true, publicKey });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd pobierania klucza VAPID.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
