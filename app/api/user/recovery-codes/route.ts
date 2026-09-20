import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { userSettingsService } from "@/lib/user/user-settings-service";

export async function POST() {
  const sessionData = await getCurrentSession();
  if (!sessionData) {
    return NextResponse.json({ error: "Wymagane zalogowanie." }, { status: 401 });
  }

  try {
    const codes = await userSettingsService.generateRecoveryCodes(sessionData.user.id);
    return NextResponse.json({ codes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Błąd generowania kodów awaryjnych.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
