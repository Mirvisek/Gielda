import { NextRequest, NextResponse } from "next/server";
import { verifyPasskeyAuthentication } from "@/lib/auth/passkey";
import { createSession } from "@/lib/auth/session";
import { checkRateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request-context";
import { genericAuthErrorResponse } from "@/lib/auth/guards";
import { logSecurityEvent } from "@/lib/security/security-event";
import { z } from "zod";
import prisma from "@/lib/db/prisma";

const verifySchema = z.object({
  challengeKey: z.string().min(1),
  response: z.any(),
  deviceId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getRequestContext(req);
  const rateLimit = await checkRateLimit("passkey_auth", ctx.ip);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: `Zbyt wiele prób logowania. Spróbuj ponownie za ${rateLimit.resetInSeconds} sekund.` },
      { status: 429 }
    );
  }

  let body;
  try {
    const json = await req.json();
    body = verifySchema.parse(json);
  } catch {
    return genericAuthErrorResponse(400);
  }

  try {
    const user = await verifyPasskeyAuthentication(body.challengeKey, body.response);

    // Reset rate limit dla udanego logowania
    await resetRateLimit("passkey_auth", ctx.ip);

    // Zaktualizuj lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Utwórz nową bezpieczną sesję z ciasteczkiem HttpOnly
    await createSession(user.id, body.deviceId);

    await logSecurityEvent({
      userId: user.id,
      eventType: "LOGIN_SUCCESS",
      success: true,
      req,
      deviceId: body.deviceId,
      metadata: { method: "PASSKEY" },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Nieznany błąd";
    await logSecurityEvent({
      eventType: "LOGIN_FAILURE",
      success: false,
      req,
      metadata: { method: "PASSKEY", error: message },
    });
    return genericAuthErrorResponse(401);
  }
}
