import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { userSettingsService } from "@/lib/user/user-settings-service";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionData = await getCurrentSession();
  if (!sessionData) {
    return NextResponse.json({ error: "Wymagane zalogowanie." }, { status: 401 });
  }

  try {
    const { id } = await params;
    const result = await userSettingsService.deletePasskey(sessionData.user.id, id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Błąd usuwania klucza Passkey.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
