import { NextResponse } from "next/server";
import { createPasskeyAuthenticationOptions } from "@/lib/auth/passkey";
import { generateSecureToken } from "@/lib/auth/tokens";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request-context";

export async function POST() {
  const ctx = await getRequestContext();
  const rateLimit = await checkRateLimit("passkey_auth", ctx.ip);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: `Zbyt wiele prób logowania. Spróbuj ponownie za ${rateLimit.resetInSeconds} sekund.` },
      { status: 429 }
    );
  }

  try {
    const challengeKey = generateSecureToken(16);
    const options = await createPasskeyAuthenticationOptions(challengeKey);

    return NextResponse.json({
      options,
      challengeKey,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Błąd generowania opcji logowania Passkey.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
