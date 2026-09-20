import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { createPasskeyRegistrationOptions } from "@/lib/auth/passkey";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request-context";

export async function POST() {
  const ctx = await getRequestContext();
  const rateLimit = await checkRateLimit("passkey_reg", ctx.ip);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Zbyt wiele prób. Spróbuj później." }, { status: 429 });
  }

  const sessionData = await getCurrentSession();
  if (!sessionData || sessionData.user.status !== "ACTIVE") {
    return NextResponse.json({ error: "Wymagane zalogowanie." }, { status: 401 });
  }

  try {
    const options = await createPasskeyRegistrationOptions(sessionData.user.id);
    return NextResponse.json(options);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Błąd generowania opcji rejestracji.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
