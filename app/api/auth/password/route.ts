import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { isAuthMethodAllowed } from "@/lib/auth/auth-methods";
import { checkRateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { logSecurityEvent } from "@/lib/security/security-event";
import { getRequestContext } from "@/lib/security/request-context";
import {
  genericAuthErrorResponse,
  simulatePasswordTiming,
} from "@/lib/auth/guards";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getRequestContext(req);

  // 1. Rate Limiting chroniący przed brute-force
  const rateLimit = await checkRateLimit("password", ctx.ip);
  if (!rateLimit.success) {
    await logSecurityEvent({
      eventType: "RATE_LIMITED",
      success: false,
      req,
      metadata: { action: "password_login", ip: ctx.ip },
    });
    return NextResponse.json(
      { error: `Zbyt wiele prób logowania. Spróbuj ponownie za ${rateLimit.resetInSeconds} sekund.` },
      { status: 429 }
    );
  }

  // 2. Walidacja danych wejściowych
  let body;
  try {
    const json = await req.json();
    body = loginSchema.parse(json);
  } catch {
    return genericAuthErrorResponse(400);
  }

  const normalizedEmail = body.email.trim().toLowerCase();

  // 3. Wyszukanie użytkownika
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  // Ochrona przed enumeracją kont i timing attacks
  if (!user || !user.passwordHash) {
    await simulatePasswordTiming();
    await logSecurityEvent({
      eventType: "LOGIN_FAILURE",
      success: false,
      req,
      metadata: { reason: "USER_NOT_FOUND_OR_NO_PASSWORD" },
    });
    return genericAuthErrorResponse(401);
  }

  // 4. Sprawdzenie statusu konta
  if (user.status !== "ACTIVE") {
    await simulatePasswordTiming();
    await logSecurityEvent({
      userId: user.id,
      eventType: "LOGIN_FAILURE",
      success: false,
      req,
      metadata: { reason: `ACCOUNT_STATUS_${user.status}` },
    });
    return genericAuthErrorResponse(401);
  }

  // 5. Sprawdzenie czy metoda PASSWORD jest dozwolona dla tego użytkownika
  const isAllowed = await isAuthMethodAllowed(user.id, "PASSWORD");
  if (!isAllowed) {
    await simulatePasswordTiming();
    await logSecurityEvent({
      userId: user.id,
      eventType: "LOGIN_FAILURE",
      success: false,
      req,
      metadata: { reason: "AUTH_METHOD_PASSWORD_NOT_ALLOWED" },
    });
    return genericAuthErrorResponse(401);
  }

  // 6. Weryfikacja hasła Argon2id
  const isPasswordValid = await verifyPassword(user.passwordHash, body.password);
  if (!isPasswordValid) {
    await logSecurityEvent({
      userId: user.id,
      eventType: "LOGIN_FAILURE",
      success: false,
      req,
      metadata: { reason: "INVALID_PASSWORD" },
    });
    return genericAuthErrorResponse(401);
  }

  // 7. Sukces - reset licznika rate-limit, aktualizacja lastLoginAt, utworzenie sesji
  await resetRateLimit("password", ctx.ip);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await createSession(user.id, body.deviceId);

  await logSecurityEvent({
    userId: user.id,
    eventType: "LOGIN_SUCCESS",
    success: true,
    req,
    deviceId: body.deviceId,
    metadata: { method: "PASSWORD" },
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
