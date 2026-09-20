import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { userSettingsService } from "@/lib/user/user-settings-service";
import { OAuthProvider } from "@prisma/client";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const sessionData = await getCurrentSession();
  if (!sessionData) {
    return NextResponse.json({ error: "Wymagane zalogowanie." }, { status: 401 });
  }

  try {
    const { provider } = await params;
    const upperProvider = provider.toUpperCase();

    if (!["GOOGLE", "APPLE", "FACEBOOK"].includes(upperProvider)) {
      return NextResponse.json({ error: "Nieprawidłowy dostawca tożsamości." }, { status: 400 });
    }

    const result = await userSettingsService.unlinkOAuthAccount(
      sessionData.user.id,
      upperProvider as OAuthProvider
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Błąd odłączania konta OAuth.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
