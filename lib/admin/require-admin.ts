import { getCurrentSession } from "@/lib/auth/session";
import { User, UserRole, UserStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getRequestContext } from "@/lib/security/request-context";

export class AdminAuthorizationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 403) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Centralny serwerowy guard uprawnień administratora.
 * Zgodnie z wytycznymi OWASP (Deny by Default):
 * 1. Weryfikuje aktywną sesję z ciasteczka HttpOnly
 * 2. Weryfikuje status konta == ACTIVE
 * 3. Weryfikuje rolę == ADMIN
 * 4. Stosuje rate limiting dedykowany dla ścieżek administracyjnych
 */
export async function requireAdmin(): Promise<User> {
  const sessionData = await getCurrentSession();

  if (!sessionData) {
    throw new AdminAuthorizationError("Brak autoryzacji sesji. Wymagane ponowne logowanie.", 401);
  }

  const { user } = sessionData;

  if (user.status !== UserStatus.ACTIVE) {
    throw new AdminAuthorizationError(
      `Dostęp zablokowany. Twoje konto ma status: ${user.status}.`,
      403
    );
  }

  if (user.role !== UserRole.ADMIN) {
    throw new AdminAuthorizationError(
      "Odmowa dostępu. Wymagane uprawnienia administratora.",
      403
    );
  }

  // Rate limiting dla operacji administracyjnych
  const ctx = await getRequestContext();
  const rateLimit = await checkRateLimit("admin", `${ctx.ip}:${user.id}`);
  if (!rateLimit.success) {
    throw new AdminAuthorizationError(
      `Przekroczono limit operacji administracyjnych. Spróbuj ponownie za ${rateLimit.resetInSeconds} sekund.`,
      429
    );
  }

  return user;
}

/**
 * Pomocniczy handler błędów dla tras API admina.
 */
export function handleAdminError(error: unknown): NextResponse {
  if (error instanceof AdminAuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }

  const message = error instanceof Error ? error.message : "Wewnętrzny błąd serwera.";
  console.error("[Admin API Error]:", error);
  return NextResponse.json({ error: message }, { status: 400 });
}
