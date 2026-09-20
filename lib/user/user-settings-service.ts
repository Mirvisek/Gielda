import prisma from "@/lib/db/prisma";
import { OAuthProvider, AuthMethod } from "@prisma/client";
import { hashPassword, verifyPassword, validatePasswordPolicy } from "@/lib/auth/password";
import { generateAndStoreRecoveryCodes } from "@/lib/auth/recovery";
import { logSecurityEvent } from "@/lib/security/security-event";

export interface UserSettingsDto {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    status: string;
    createdAt: string;
    hasPassword: boolean;
  };
  authMethods: {
    method: string;
    enabled: boolean;
  }[];
  passkeys: {
    id: string;
    name: string;
    deviceType: string | null;
    createdAt: string;
    lastUsedAt: string | null;
  }[];
  oauthAccounts: {
    id: string;
    provider: string;
    providerAccountId: string;
    createdAt: string;
  }[];
  sessions: {
    id: string;
    ipAddress: string | null;
    userAgent: string | null;
    deviceId: string | null;
    createdAt: string;
    lastSeenAt: string;
    isCurrent: boolean;
  }[];
  unusedRecoveryCodesCount: number;
}

export class UserSettingsService {
  /**
   * Pobiera pełne ustawienia, metody logowania, klucze passkey, konta oauth i aktywne sesje użytkownika.
   */
  async getUserSettings(userId: string, currentSessionId?: string): Promise<UserSettingsDto> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        authMethods: true,
        passkeys: {
          orderBy: { createdAt: "desc" },
        },
        oauthAccounts: {
          orderBy: { createdAt: "desc" },
        },
        sessions: {
          where: {
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { lastSeenAt: "desc" },
        },
      },
    });

    if (!user) {
      throw new Error("Użytkownik nie został odnaleziony.");
    }

    const unusedRecoveryCodesCount = await prisma.recoveryCode.count({
      where: {
        userId,
        usedAt: null,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        hasPassword: !!user.passwordHash,
      },
      authMethods: user.authMethods.map((m) => ({
        method: m.method,
        enabled: m.enabled,
      })),
      passkeys: user.passkeys.map((p) => ({
        id: p.id,
        name: p.name,
        deviceType: p.deviceType,
        createdAt: p.createdAt.toISOString(),
        lastUsedAt: p.lastUsedAt ? p.lastUsedAt.toISOString() : null,
      })),
      oauthAccounts: user.oauthAccounts.map((o) => ({
        id: o.id,
        provider: o.provider,
        providerAccountId: o.providerAccountId,
        createdAt: o.createdAt.toISOString(),
      })),
      sessions: user.sessions.map((s) => ({
        id: s.id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        deviceId: s.deviceId,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        isCurrent: s.id === currentSessionId,
      })),
      unusedRecoveryCodesCount,
    };
  }

  /**
   * Aktualizuje wyświetlaną nazwę użytkownika.
   */
  async updateDisplayName(userId: string, displayName: string): Promise<{ displayName: string }> {
    const trimmed = displayName.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 100) {
      throw new Error("Wyświetlana nazwa musi mieć od 2 do 100 znaków.");
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { displayName: trimmed },
    });

    return { displayName: updated.displayName };
  }

  /**
   * Zmienia hasło użytkownika z weryfikacją starego hasła i haszowaniem Argon2id.
   */
  async changePassword(
    userId: string,
    currentPassword?: string,
    newPassword?: string
  ): Promise<{ success: boolean }> {
    if (!newPassword) {
      throw new Error("Nowe hasło jest wymagane.");
    }

    const policy = validatePasswordPolicy(newPassword);
    if (!policy.valid) {
      throw new Error(policy.error || "Nowe hasło nie spełnia wymagań bezpieczeństwa.");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("Użytkownik nie istnieje.");
    }

    // Jeśli użytkownik ma już hasło, wymagana jest weryfikacja aktualnego hasła
    if (user.passwordHash) {
      if (!currentPassword) {
        throw new Error("Wprowadź aktualne hasło.");
      }
      const isValid = await verifyPassword(user.passwordHash, currentPassword);
      if (!isValid) {
        await logSecurityEvent({
          userId,
          eventType: "PASSWORD_CHANGED",
          success: false,
          metadata: { reason: "Błędne dotychczasowe hasło" },
        });
        throw new Error("Aktualne hasło jest nieprawidłowe.");
      }
    }

    const newHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      }),
      prisma.userAuthMethod.upsert({
        where: {
          userId_method: {
            userId,
            method: "PASSWORD",
          },
        },
        update: { enabled: true },
        create: {
          userId,
          method: "PASSWORD",
          enabled: true,
        },
      }),
    ]);

    await logSecurityEvent({
      userId,
      eventType: "PASSWORD_CHANGED",
      success: true,
    });

    return { success: true };
  }

  /**
   * Usuwa klucz Passkey z obroną IDOR oraz regułą Anti-Lockout (brak usunięcia ostatniej metody logowania).
   */
  async deletePasskey(userId: string, passkeyId: string): Promise<{ success: boolean }> {
    const passkey = await prisma.passkey.findUnique({
      where: { id: passkeyId },
    });

    if (!passkey || passkey.userId !== userId) {
      throw new Error("Klucz Passkey nie został odnaleziony lub brak uprawnień.");
    }

    // Reguła Anti-Lockout: Sprawdź, czy użytkownik ma inną metodę logowania
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        passkeys: true,
        oauthAccounts: true,
      },
    });

    if (!user) {
      throw new Error("Użytkownik nie istnieje.");
    }

    const hasOtherPasskey = user.passkeys.length > 1;
    const hasPassword = !!user.passwordHash;
    const hasOAuth = user.oauthAccounts.length > 0;

    if (!hasOtherPasskey && !hasPassword && !hasOAuth) {
      throw new Error(
        "Nie możesz usunąć jedynego klucza dostępu, dopóki nie ustawisz hasła lub nie podepniesz innego klucza."
      );
    }

    await prisma.passkey.delete({
      where: { id: passkeyId },
    });

    // Jeśli nie ma już żadnych passkeys, dezaktywuj metodę PASSKEY w user_auth_methods
    if (user.passkeys.length <= 1) {
      await prisma.userAuthMethod.updateMany({
        where: {
          userId,
          method: "PASSKEY",
        },
        data: { enabled: false },
      });
    }

    await logSecurityEvent({
      userId,
      eventType: "PASSKEY_REMOVED",
      success: true,
      metadata: { passkeyId },
    });

    return { success: true };
  }

  /**
   * Unieważnia wszystkie inne aktywne sesje użytkownika poza bieżącą.
   */
  async revokeOtherSessions(
    userId: string,
    currentSessionId?: string
  ): Promise<{ revokedCount: number }> {
    const whereClause: {
      userId: string;
      revokedAt: null;
      id?: { not: string };
    } = {
      userId,
      revokedAt: null,
    };

    if (currentSessionId) {
      whereClause.id = { not: currentSessionId };
    }

    const result = await prisma.session.updateMany({
      where: whereClause,
      data: { revokedAt: new Date() },
    });

    await logSecurityEvent({
      userId,
      eventType: "SESSIONS_REVOKED_ALL",
      success: true,
      metadata: { count: result.count },
    });

    return { revokedCount: result.count };
  }

  /**
   * Generuje nowy zestaw 8 jednorazowych kodów awaryjnych (Recovery Codes).
   */
  async generateRecoveryCodes(userId: string): Promise<string[]> {
    const codes = await generateAndStoreRecoveryCodes(userId, 8);

    await logSecurityEvent({
      userId,
      eventType: "RECOVERY_CODES_GENERATED",
      success: true,
      metadata: { count: codes.length },
    });

    return codes;
  }

  /**
   * Wiąże konto dostawcy zewnętrznego (Google, Apple, Facebook) z bieżącym profilem użytkownika.
   */
  async linkOAuthAccount(
    userId: string,
    provider: OAuthProvider,
    providerAccountId: string
  ): Promise<{ success: boolean; provider: OAuthProvider; providerAccountId: string }> {
    const trimmedId = providerAccountId.trim();
    if (!trimmedId || trimmedId.length < 2) {
      throw new Error("Identyfikator konta lub adres email dostawcy jest nieprawidłowy.");
    }

    if (!["GOOGLE", "APPLE", "FACEBOOK"].includes(provider)) {
      throw new Error("Nieobsługiwany dostawca tożsamości.");
    }

    // 1. Sprawdź, czy to konto zewnętrznego dostawcy nie jest powiązane z INNYM użytkownikiem
    const existingBinding = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId: trimmedId,
        },
      },
    });

    if (existingBinding && existingBinding.userId !== userId) {
      throw new Error(`To konto ${provider} (${trimmedId}) jest już powiązane z innym kontem w systemie.`);
    }

    // 2. Transakcja: zapis powiązania i aktywacja metody logowania
    await prisma.$transaction(async (tx) => {
      // Usuń ewentualne dotychczasowe powiązanie tego samego dostawcy dla tego użytkownika
      await tx.oAuthAccount.deleteMany({
        where: {
          userId,
          provider,
        },
      });

      // Utwórz nowy rekord
      await tx.oAuthAccount.create({
        data: {
          userId,
          provider,
          providerAccountId: trimmedId,
        },
      });

      // Aktywuj metodę logowania dla tego konta
      await tx.userAuthMethod.upsert({
        where: {
          userId_method: {
            userId,
            method: provider as AuthMethod,
          },
        },
        update: { enabled: true },
        create: {
          userId,
          method: provider as AuthMethod,
          enabled: true,
        },
      });
    });

    await logSecurityEvent({
      userId,
      eventType: "OAUTH_LINKED",
      success: true,
      metadata: { provider, providerAccountId: trimmedId },
    });

    return {
      success: true,
      provider,
      providerAccountId: trimmedId,
    };
  }

  /**
   * Odłącza konto zewnętrznego dostawcy (Google, Apple, Facebook) z ochroną Anti-Lockout.
   */
  async unlinkOAuthAccount(
    userId: string,
    provider: OAuthProvider
  ): Promise<{ success: boolean }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        passkeys: true,
        oauthAccounts: true,
      },
    });

    if (!user) {
      throw new Error("Użytkownik nie istnieje.");
    }

    const linkedAccount = user.oauthAccounts.find((acc) => acc.provider === provider);
    if (!linkedAccount) {
      throw new Error(`Konto ${provider} nie jest powiązane z Twoim profilem.`);
    }

    // Reguła Anti-Lockout: Użytkownik musi posiadać inną dostępną metodę logowania
    const otherOAuthCount = user.oauthAccounts.filter((acc) => acc.provider !== provider).length;
    const hasPassword = !!user.passwordHash;
    const hasPasskeys = user.passkeys.length > 0;

    if (otherOAuthCount === 0 && !hasPassword && !hasPasskeys) {
      throw new Error(
        "Nie możesz odłączyć tego konta, ponieważ jest to Twoja jedyna metoda logowania (Anti-Lockout). Ustaw najpierw hasło lub dodaj klucz Passkey."
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.oAuthAccount.delete({
        where: { id: linkedAccount.id },
      });

      await tx.userAuthMethod.updateMany({
        where: {
          userId,
          method: provider as AuthMethod,
        },
        data: { enabled: false },
      });
    });

    await logSecurityEvent({
      userId,
      eventType: "OAUTH_UNLINKED",
      success: true,
      metadata: { provider },
    });

    return { success: true };
  }
}

export const userSettingsService = new UserSettingsService();
