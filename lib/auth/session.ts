import { cookies } from "next/headers";
import prisma from "@/lib/db/prisma";
import { generateSecureToken, hashToken } from "./tokens";
import { getRequestContext } from "@/lib/security/request-context";
import { User, Session } from "@prisma/client";
import { logSecurityEvent } from "@/lib/security/security-event";

export const SESSION_COOKIE_NAME = "market_session";
export const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60; // 7 dni

export interface SessionWithUser {
  session: Session;
  user: User;
}

/**
 * Tworzy nową sesję dla użytkownika:
 * 1. Generuje 256-bitowy losowy token (CSPRNG)
 * 2. Haszuje go SHA-256 i zapisuje w bazie MariaDB
 * 3. Zapisuje czysty token w ciasteczku HttpOnly Secure
 */
export async function createSession(userId: string, deviceId?: string): Promise<{ token: string; session: Session }> {
  const token = generateSecureToken(32); // 256 bitów entropii
  const sessionHash = hashToken(token);
  const ctx = await getRequestContext();

  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      userId,
      sessionHash,
      expiresAt,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent.slice(0, 500),
      deviceId: deviceId || null,
    },
  });

  // Ustawienie bezpiecznego ciasteczka HttpOnly
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  await logSecurityEvent({
    userId,
    eventType: "SESSION_CREATED",
    success: true,
    deviceId,
    metadata: { sessionId: session.id },
  });

  return { token, session };
}

/**
 * Weryfikuje aktualną sesję z ciasteczka.
 * Sprawdza: istnienie, czy nieodwołana, termin ważności oraz czy użytkownik ma status ACTIVE.
 */
export async function getCurrentSession(): Promise<SessionWithUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      return null;
    }

    const sessionHash = hashToken(token);
    const session = await prisma.session.findUnique({
      where: { sessionHash },
      include: { user: true },
    });

    if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
      return null;
    }

    // Użytkownik musi mieć status ACTIVE
    if (session.user.status !== "ACTIVE") {
      return null;
    }

    // Okresowa aktualizacja lastSeenAt (np. raz na 15 minut)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (session.lastSeenAt < fifteenMinutesAgo) {
      await prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }

    return {
      session,
      user: session.user,
    };
  } catch (error) {
    console.error("[Session Validation Error]:", error);
    return null;
  }
}

/**
 * Unieważnia pojedynczą sesję i czyści ciasteczko.
 */
export async function revokeCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const sessionHash = hashToken(token);
    try {
      const session = await prisma.session.update({
        where: { sessionHash },
        data: { revokedAt: new Date() },
      });

      await logSecurityEvent({
        userId: session.userId,
        eventType: "SESSION_REVOKED",
        success: true,
        metadata: { sessionId: session.id },
      });
    } catch {
      // Ignoruj jeśli sesja nie istniała
    }
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Unieważnia wszystkie aktywne sesje wskazanego użytkownika (np. po zmianie hasła lub z panelu admina).
 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  await logSecurityEvent({
    userId,
    eventType: "SESSION_REVOKED",
    success: true,
    metadata: { count: result.count, action: "REVOKE_ALL" },
  });

  return result.count;
}
