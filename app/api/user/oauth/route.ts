import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { userSettingsService } from "@/lib/user/user-settings-service";
import { OAuthProvider } from "@prisma/client";
import { z } from "zod";

const linkSchema = z.object({
  provider: z.enum(["GOOGLE", "APPLE", "FACEBOOK"]),
  providerAccountId: z.string().min(2).max(255),
});

export async function POST(req: NextRequest) {
  const sessionData = await getCurrentSession();
  if (!sessionData) {
    return NextResponse.json({ error: "Wymagane zalogowanie." }, { status: 401 });
  }

  try {
    const json = await req.json();
    const { provider, providerAccountId } = linkSchema.parse(json);

    const result = await userSettingsService.linkOAuthAccount(
      sessionData.user.id,
      provider as OAuthProvider,
      providerAccountId
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Błąd powiązania konta OAuth.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
