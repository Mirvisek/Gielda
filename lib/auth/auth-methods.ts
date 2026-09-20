import prisma from "@/lib/db/prisma";
import { AuthMethod, OAuthProvider } from "@prisma/client";

/**
 * Sprawdza, czy dana metoda uwierzytelnienia jest dozwolona i aktywna dla konkretnego użytkownika.
 */
export async function isAuthMethodAllowed(userId: string, method: AuthMethod): Promise<boolean> {
  const record = await prisma.userAuthMethod.findUnique({
    where: {
      userId_method: {
        userId,
        method,
      },
    },
  });

  return !!record && record.enabled;
}

/**
 * Pobiera listę wszystkich włączonych metod autentykacji dla użytkownika.
 */
export async function getUserAllowedAuthMethods(userId: string): Promise<AuthMethod[]> {
  const records = await prisma.userAuthMethod.findMany({
    where: {
      userId,
      enabled: true,
    },
  });

  return records.map((r) => r.method);
}

/**
 * Ustawia lub aktualizuje dozwolone metody autentykacji dla użytkownika (operacja administracyjna).
 */
export async function setUserAuthMethods(
  userId: string,
  allowedMethods: Record<AuthMethod, boolean>
): Promise<void> {
  const operations = Object.entries(allowedMethods).map(([method, enabled]) => {
    return prisma.userAuthMethod.upsert({
      where: {
        userId_method: {
          userId,
          method: method as AuthMethod,
        },
      },
      update: { enabled },
      create: {
        userId,
        method: method as AuthMethod,
        enabled,
      },
    });
  });

  await prisma.$transaction(operations);
}

/**
 * Rygorystyczna weryfikacja logowania OAuth:
 * 1. Sprawdza, czy provider jest włączony w `user_auth_methods`.
 * 2. Sprawdza, czy konto z danym `providerAccountId` zostało uprzednio powiązane w `oauth_accounts`.
 * NIGDY nie pozwala na logowanie tylko dlatego, że email się zgadza!
 */
export async function verifyOAuthBinding(
  userId: string,
  provider: OAuthProvider,
  providerAccountId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const methodMap: Record<OAuthProvider, AuthMethod> = {
    GOOGLE: "GOOGLE",
    APPLE: "APPLE",
    FACEBOOK: "FACEBOOK",
  };

  const isAllowed = await isAuthMethodAllowed(userId, methodMap[provider]);
  if (!isAllowed) {
    return {
      allowed: false,
      reason: `Metoda ${provider} nie została zezwolona dla tego konta przez administratora.`,
    };
  }

  const linkedAccount = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId,
      },
    },
  });

  if (!linkedAccount || linkedAccount.userId !== userId) {
    return {
      allowed: false,
      reason: `Konto ${provider} nie zostało uprzednio powiązane z Twoim kontem w aplikacji.`,
    };
  }

  return { allowed: true };
}
