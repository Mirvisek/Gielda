import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { verifyPasskeyRegistration } from "@/lib/auth/passkey";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request-context";
import { z } from "zod";

const verifySchema = z.object({
  response: z.any(),
  deviceName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getRequestContext(req);
  const rateLimit = await checkRateLimit("passkey_reg", ctx.ip);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Zbyt wiele prób." }, { status: 429 });
  }

  const sessionData = await getCurrentSession();
  if (!sessionData || sessionData.user.status !== "ACTIVE") {
    return NextResponse.json({ error: "Wymagane zalogowanie." }, { status: 401 });
  }

  try {
    const json = await req.json();
    const { response, deviceName } = verifySchema.parse(json);

    const passkey = await verifyPasskeyRegistration(
      sessionData.user.id,
      response,
      deviceName || "Klucz dostępu (Passkey)"
    );

    return NextResponse.json({
      success: true,
      passkey: {
        id: passkey.id,
        name: passkey.name,
        deviceType: passkey.deviceType,
        createdAt: passkey.createdAt,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Weryfikacja rejestracji nie powiodła się.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
