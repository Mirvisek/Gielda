import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { pushService } from "@/lib/alerts/push-service";
import { PushSubscriptionSchema } from "@/lib/alerts/types";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = PushSubscriptionSchema.parse(body);
    const userAgent = req.headers.get("user-agent") || undefined;

    const saved = await pushService.saveSubscription(user.id, parsed, userAgent);
    return NextResponse.json({ success: true, data: saved }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd rejestracji subskrypcji push.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
