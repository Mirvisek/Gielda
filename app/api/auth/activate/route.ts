import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { hashToken } from "@/lib/auth/tokens";
import { hashPassword, validatePasswordPolicy } from "@/lib/auth/password";
import { generateAndStoreRecoveryCodes } from "@/lib/auth/recovery";
import { createSession } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request-context";
import { logSecurityEvent } from "@/lib/security/security-event";
import { z } from "zod";

const activateSchema = z.object({
  token: z.string().min(16),
  password: z.string(),
  deviceId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getRequestContext(req);
  const rateLimit = await checkRateLimit("password", ctx.ip);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Zbyt wiele prób. Spróbuj później." }, { status: 429 });
  }

  let body;
  try {
    const json = await req.json();
    body = activateSchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane aktywacyjne." }, { status: 400 });
  }

  // 1. Walidacja polityki haseł
  const passwordCheck = validatePasswordPolicy(body.password);
  if (!passwordCheck.valid) {
    return NextResponse.json({ error: passwordCheck.error }, { status: 400 });
  }

  // 2. Wyszukanie konta po skrócie tokenu aktywacyjnego
  const tokenHash = hashToken(body.token);
  const user = await prisma.user.findFirst({
    where: {
      activationTokenHash: tokenHash,
      activationExpiresAt: { gt: new Date() },
      status: "INVITED",
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Link aktywacyjny jest nieprawidłowy, wygasł lub został już wykorzystany." },
      { status: 400 }
    );
  }

  // 3. Haszowanie hasła Argon2id
  const passwordHash = await hashPassword(body.password);

  // 4. Aktywacja użytkownika i unieważnienie tokenu
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      status: "ACTIVE",
      passwordHash,
      activationTokenHash: null,
      activationExpiresAt: null,
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
    },
  });

  // 5. Wygenerowanie jednorazowych kodów recovery
  const recoveryCodes = await generateAndStoreRecoveryCodes(user.id, 8);

  // 6. Utworzenie sesji
  await createSession(user.id, body.deviceId);

  await logSecurityEvent({
    userId: user.id,
    eventType: "LOGIN_SUCCESS",
    success: true,
    req,
    metadata: { action: "ACCOUNT_ACTIVATED" },
  });

  return NextResponse.json({
    success: true,
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      displayName: updatedUser.displayName,
      role: updatedUser.role,
    },
    recoveryCodes,
  });
}
