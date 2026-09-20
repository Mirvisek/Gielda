import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { userSettingsService } from "@/lib/user/user-settings-service";

export async function POST() {
  const sessionData = await getCurrentSession();
  if (!sessionData) {
    return NextResponse.json({ error: "Wymagane zalogowanie." }, { status: 401 });
  }

  try {
    const result = await userSettingsService.revokeOtherSessions(
      sessionData.user.id,
      sessionData.session.id
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Błąd wylogowania innych sesji.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
