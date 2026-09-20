import { getCurrentSession } from "./session";
import { User, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { verifyPassword } from "./password";

export const GENERIC_AUTH_ERROR_MESSAGE =
  "Nieprawidłowe poświadczenia lub brak dostępu. Aplikacja jest ściśle prywatna.";

// Dummy hash do symulacji stałego czasu weryfikacji hasła dla nieistniejących kont
const DUMMY_ARGON2_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0MTIzNDU2$K1r3nL8vT9yB7gO5qX4mZ0wP2jR8sE1uA9cI3fH7vDk";

/**
 * Symuluje obliczenie weryfikacji hasła Argon2id, gdy użytkownik nie istnieje w bazie.
 * Zapobiega atakom timingowym na enumerację adresów email.
 */
export async function simulatePasswordTiming(): Promise<void> {
  await verifyPassword(DUMMY_ARGON2_HASH, "dummy_password_timing_protection");
}

/**
 * Zwraca ustandaryzowaną, neutralną odpowiedź błędu autoryzacji (ochrona przed account enumeration).
 */
export function genericAuthErrorResponse(status: number = 401): NextResponse {
  return NextResponse.json(
    {
      error: GENERIC_AUTH_ERROR_MESSAGE,
    },
    { status }
  );
}

/**
 * Wymaga aktywnej sesji użytkownika. Zwraca obiekt User lub rzuca błąd.
 */
export async function requireAuth(): Promise<User> {
  const sessionData = await getCurrentSession();
  if (!sessionData || sessionData.user.status !== "ACTIVE") {
    throw new Error("UNAUTHORIZED");
  }
  return sessionData.user;
}

/**
 * Wymaga uprawnień Administratora (rola ADMIN + status ACTIVE).
 */
export async function requireAdmin(): Promise<User> {
  const user = await requireAuth();
  if (user.role !== UserRole.ADMIN) {
    throw new Error("FORBIDDEN");
  }
  return user;
}
