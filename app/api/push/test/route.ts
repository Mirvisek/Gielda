import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { pushService } from "@/lib/alerts/push-service";

export async function POST() {
  try {
    const user = await requireAuth();

    const result = await pushService.sendNotificationToUser(user.id, {
      title: "Giełda AI — Test Notyfikacji",
      body: "Powiadomienia Web Push PWA na Twoim urządzeniu działają prawidłowo!",
      url: "/alerts",
      tag: "test-push",
    });

    return NextResponse.json({
      success: true,
      message:
        result.sentCount > 0
          ? `Wysłano testowe powiadomienie do ${result.sentCount} urządzenia/urządzeń.`
          : "Nie znaleziono zarejestrowanych urządzeń push dla Twojego konta. Włącz powiadomienia w przeglądarce.",
      result,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Błąd wysyłki powiadomienia testowego.";
    const status = msg === "UNAUTHORIZED" ? 401 : msg === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
