import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { verifyAndConsumeRecoveryCode } from "@/lib/auth/recovery";
import { createSession } from "@/lib/auth/session";
import { checkRateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request-context";
import { genericAuthErrorResponse, simulatePasswordTiming } from "@/lib/auth/guards";
import { logSecurityEvent } from "@/lib/security/security-event";
import { z } from "zod";

const recoverySchema = z.object({
  email: z.string().email(),
  recoveryCode: z.string().min(8),
  deviceId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getRequestContext(req);
  const rateLimit = await checkRateLimit("recovery", ctx.ip);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: `Zbyt wiele prób awaryjnych. Spróbuj ponownie za ${rateLimit.resetInSeconds} sekund.` },
      { status: 429 }
    );
  }

  let body;
  try {
    const json = await req.json();
    body = recoverySchema.parse(json);
  } catch {
    return genericAuthErrorResponse(400);
  }

  const normalizedEmail = body.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user || user.status !== "ACTIVE") {
    await simulatePasswordTiming();
    return genericAuthErrorResponse(401);
  }

  const isValid = await verifyAndConsumeRecoveryCode(user.id, body.recoveryCode);
  if (!isValid) {
    return genericAuthErrorResponse(401);
  }

  // Sukces
  await resetRateLimit("recovery", ctx.ip);
  await createSession(user.id, body.deviceId);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await logSecurityEvent({
    userId: user.id,
    eventType: "LOGIN_SUCCESS",
    success: true,
    req,
    deviceId: body.deviceId,
    metadata: { method: "RECOVERY_CODE" },
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
}
