import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { notificationService } from "@/lib/alerts/notification-service";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const searchParams = req.nextUrl.searchParams;
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "30", 10);

    const result = await notificationService.getNotifications(
      user.id,
      unreadOnly,
      page,
      limit
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd pobierania powiadomień.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH() {
  try {
    const user = await requireAuth();
    await notificationService.markAllAsRead(user.id);
    return NextResponse.json({ success: true, message: "Wszystkie powiadomienia oznaczone jako przeczytane." });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd aktualizacji powiadomień.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
