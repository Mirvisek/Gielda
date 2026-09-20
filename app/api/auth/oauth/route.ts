import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { createSession } from "@/lib/auth/session";
import { verifyOAuthBinding } from "@/lib/auth/auth-methods";
import { checkRateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { logSecurityEvent } from "@/lib/security/security-event";
import { getRequestContext } from "@/lib/security/request-context";
import { genericAuthErrorResponse, simulatePasswordTiming } from "@/lib/auth/guards";
import { OAuthProvider } from "@prisma/client";
import { z } from "zod";

const oauthLoginSchema = z.object({
  provider: z.enum(["GOOGLE", "APPLE", "FACEBOOK"]),
  providerAccountId: z.string().min(2),
  deviceId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getRequestContext(req);

  // 1. Rate Limiting dla logowania OAuth
  const rateLimit = await checkRateLimit("oauth", ctx.ip);
  if (!rateLimit.success) {
    await logSecurityEvent({
      eventType: "RATE_LIMITED",
      success: false,
      req,
      metadata: { action: "oauth_login", ip: ctx.ip },
    });
    return NextResponse.json(
      { error: `Zbyt wiele prób logowania. Spróbuj ponownie za ${rateLimit.resetInSeconds} sekund.` },
      { status: 429 }
    );
  }

  // 2. Walidacja
  let body;
  try {
    const json = await req.json();
    body = oauthLoginSchema.parse(json);
  } catch {
    return genericAuthErrorResponse(400);
  }

  const trimmedId = body.providerAccountId.trim();
  const provider = body.provider as OAuthProvider;

  // 3. Wyszukaj powiązane konto OAuth
  const linkedAccount = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId: trimmedId,
      },
    },
    include: {
      user: true,
    },
  });

  if (!linkedAccount || !linkedAccount.user) {
    await simulatePasswordTiming();
    await logSecurityEvent({
      eventType: "LOGIN_FAILURE",
      success: false,
      req,
      metadata: { provider, providerAccountId: trimmedId, reason: "Brak powiązanego konta OAuth" },
    });
    return NextResponse.json(
      { error: `Konto ${provider} (${trimmedId}) nie zostało powiązane z żadnym profilem w systemie.` },
      { status: 401 }
    );
  }

  const user = linkedAccount.user;

  // 4. Weryfikacja zezwolenia w user_auth_methods
  const bindingCheck = await verifyOAuthBinding(user.id, provider, trimmedId);
  if (!bindingCheck.allowed) {
    await logSecurityEvent({
      userId: user.id,
      eventType: "LOGIN_FAILURE",
      success: false,
      req,
      metadata: { provider, reason: bindingCheck.reason },
    });
    return NextResponse.json(
      { error: bindingCheck.reason || "Metoda logowania jest wyłączona." },
      { status: 403 }
    );
  }

  // 5. Sprawdzenie statusu użytkownika
  if (user.status !== "ACTIVE") {
    await logSecurityEvent({
      userId: user.id,
      eventType: "LOGIN_FAILURE",
      success: false,
      req,
      metadata: { provider, status: user.status },
    });
    return NextResponse.json(
      { error: "Konto użytkownika jest nieaktywne lub zablokowane." },
      { status: 403 }
    );
  }

  // 6. Reset rate limitu i utworzenie sesji
  await resetRateLimit("oauth", ctx.ip);
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
    metadata: { method: provider, providerAccountId: trimmedId },
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
