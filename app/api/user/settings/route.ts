import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { userSettingsService } from "@/lib/user/user-settings-service";
import { z } from "zod";

export async function GET() {
  const sessionData = await getCurrentSession();
  if (!sessionData) {
    return NextResponse.json({ error: "Wymagane zalogowanie." }, { status: 401 });
  }

  try {
    const settings = await userSettingsService.getUserSettings(
      sessionData.user.id,
      sessionData.session.id
    );
    return NextResponse.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Błąd pobierania ustawień.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const patchSchema = z.object({
  displayName: z.string().min(2).max(100),
});

export async function PATCH(req: NextRequest) {
  const sessionData = await getCurrentSession();
  if (!sessionData) {
    return NextResponse.json({ error: "Wymagane zalogowanie." }, { status: 401 });
  }

  try {
    const json = await req.json();
    const { displayName } = patchSchema.parse(json);
    const result = await userSettingsService.updateDisplayName(sessionData.user.id, displayName);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Błąd aktualizacji profilu.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
