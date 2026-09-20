import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db/prisma";
import { userSettingsService } from "@/lib/user/user-settings-service";
import * as passwordModule from "@/lib/auth/password";
import * as recoveryModule from "@/lib/auth/recovery";
import * as securityEventModule from "@/lib/security/security-event";

vi.mock("@/lib/auth/password");
vi.mock("@/lib/auth/recovery");
vi.mock("@/lib/security/security-event");

describe("UserSettingsService — testy jednostkowe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(securityEventModule.logSecurityEvent).mockResolvedValue(undefined as any);
  });

  const userId = "user-test-123";
  const otherUserId = "user-other-456";
  const passkeyId = "passkey-abc";
  const sessionId = "session-current";

  /* ────────────────────────────────────────────────────────────── */
  /* 1. Pobieranie profilu i metod logowania                        */
  /* ────────────────────────────────────────────────────────────── */
  describe("getUserSettings", () => {
    it("powinien zwrócić dane użytkownika i listę metod logowania", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        email: "test@example.com",
        displayName: "Testowy Użytkownik",
        role: "USER",
        status: "ACTIVE",
        createdAt: new Date("2025-01-01"),
        passwordHash: "some-hash",
        authMethods: [{ method: "PASSWORD", enabled: true }],
        passkeys: [],
        oauthAccounts: [],
        sessions: [
          {
            id: sessionId,
            ipAddress: "127.0.0.1",
            userAgent: "Mozilla/5.0",
            deviceId: null,
            createdAt: new Date(),
            lastSeenAt: new Date(),
            revokedAt: null,
            expiresAt: new Date(Date.now() + 86400000),
          },
        ],
      } as any);

      vi.spyOn(prisma.recoveryCode, "count").mockResolvedValue(6);

      const result = await userSettingsService.getUserSettings(userId, sessionId);

      expect(result.user.email).toBe("test@example.com");
      expect(result.user.hasPassword).toBe(true);
      expect(result.authMethods).toHaveLength(1);
      expect(result.sessions[0].isCurrent).toBe(true);
      expect(result.unusedRecoveryCodesCount).toBe(6);
    });
  });

  /* ────────────────────────────────────────────────────────────── */
  /* 2. Zmiana hasła — prawidłowa                                   */
  /* ────────────────────────────────────────────────────────────── */
  describe("changePassword", () => {
    it("powinien zmienić hasło po poprawnej weryfikacji starego", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        passwordHash: "old-hash",
      } as any);
      vi.mocked(passwordModule.verifyPassword).mockResolvedValue(true);
      vi.mocked(passwordModule.validatePasswordPolicy).mockReturnValue({ valid: true });
      vi.mocked(passwordModule.hashPassword).mockResolvedValue("new-hash");
      vi.spyOn(prisma, "$transaction").mockResolvedValue([]);

      const result = await userSettingsService.changePassword(
        userId,
        "OldP@ssw0rd!",
        "NewP@ssw0rd123!"
      );

      expect(result.success).toBe(true);
      expect(securityEventModule.logSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "PASSWORD_CHANGED", success: true })
      );
    });

    /* ── 2b. Błędne stare hasło ── */
    it("powinien odrzucić zmianę hasła przy błędnym starym haśle", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        passwordHash: "old-hash",
      } as any);
      vi.mocked(passwordModule.verifyPassword).mockResolvedValue(false);
      vi.mocked(passwordModule.validatePasswordPolicy).mockReturnValue({ valid: true });

      await expect(
        userSettingsService.changePassword(userId, "WrongOldPass!", "NewP@ssw0rd123!")
      ).rejects.toThrow("Aktualne hasło jest nieprawidłowe.");

      expect(securityEventModule.logSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "PASSWORD_CHANGED", success: false })
      );
    });

    /* ── 2c. Walidacja siły hasła — za krótkie ── */
    it("powinien odrzucić hasło krótsze niż 12 znaków", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        passwordHash: null,
      } as any);
      vi.mocked(passwordModule.validatePasswordPolicy).mockReturnValue({
        valid: false,
        error: "Hasło musi mieć co najmniej 12 znaków.",
      });

      await expect(
        userSettingsService.changePassword(userId, undefined, "Short1!")
      ).rejects.toThrow("Hasło musi mieć co najmniej 12 znaków.");
    });
  });

  /* ────────────────────────────────────────────────────────────── */
  /* 3. Usuwanie Passkey — ochrona IDOR                            */
  /* ────────────────────────────────────────────────────────────── */
  describe("deletePasskey — IDOR", () => {
    it("powinien zablokować usunięcie klucza Passkey innego użytkownika (IDOR)", async () => {
      // Klucz należy do otherUserId
      vi.spyOn(prisma.passkey, "findUnique").mockResolvedValue({
        id: passkeyId,
        userId: otherUserId,
      } as any);

      const deleteSpy = vi.spyOn(prisma.passkey, "delete");

      await expect(
        userSettingsService.deletePasskey(userId, passkeyId)
      ).rejects.toThrow("Klucz Passkey nie został odnaleziony lub brak uprawnień.");

      expect(deleteSpy).not.toHaveBeenCalled();
    });
  });

  /* ────────────────────────────────────────────────────────────── */
  /* 4. Usuwanie Passkey — reguła Anti-Lockout                     */
  /* ────────────────────────────────────────────────────────────── */
  describe("deletePasskey — Anti-Lockout", () => {
    it("powinien zablokować usunięcie ostatniego Passkey gdy brak hasła i OAuth", async () => {
      vi.spyOn(prisma.passkey, "findUnique").mockResolvedValue({
        id: passkeyId,
        userId,
      } as any);

      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        passwordHash: null,
        passkeys: [{ id: passkeyId, userId }],
        oauthAccounts: [],
      } as any);

      await expect(
        userSettingsService.deletePasskey(userId, passkeyId)
      ).rejects.toThrow("Nie możesz usunąć jedynego klucza dostępu");
    });

    it("powinien pozwolić usunąć Passkey gdy istnieje hasło (Anti-Lockout OK)", async () => {
      vi.spyOn(prisma.passkey, "findUnique").mockResolvedValue({
        id: passkeyId,
        userId,
      } as any);

      vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
        id: userId,
        passwordHash: "some-hash",
        passkeys: [{ id: passkeyId, userId }],
        oauthAccounts: [],
      } as any);

      const deleteSpy = vi.spyOn(prisma.passkey, "delete").mockResolvedValue({} as any);
      vi.spyOn(prisma.userAuthMethod, "updateMany").mockResolvedValue({ count: 1 } as any);

      const result = await userSettingsService.deletePasskey(userId, passkeyId);

      expect(result.success).toBe(true);
      expect(deleteSpy).toHaveBeenCalledWith({ where: { id: passkeyId } });
    });
  });

  /* ────────────────────────────────────────────────────────────── */
  /* 5. Revoke innych sesji z zachowaniem bieżącej                 */
  /* ────────────────────────────────────────────────────────────── */
  describe("revokeOtherSessions", () => {
    it("powinien wylogować inne sesje zachowując bieżącą", async () => {
      const updateManySpy = vi
        .spyOn(prisma.session, "updateMany")
        .mockResolvedValue({ count: 3 } as any);

      const result = await userSettingsService.revokeOtherSessions(userId, sessionId);

      expect(result.revokedCount).toBe(3);
      expect(updateManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
            revokedAt: null,
            id: { not: sessionId },
          }),
        })
      );
      expect(securityEventModule.logSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "SESSIONS_REVOKED_ALL", success: true })
      );
    });
  });

  /* ────────────────────────────────────────────────────────────── */
  /* 6. Generowanie kodów awaryjnych                               */
  /* ────────────────────────────────────────────────────────────── */
  describe("generateRecoveryCodes", () => {
    it("powinien wygenerować 8 kodów awaryjnych w formacie XXXX-XXXX", async () => {
      const mockCodes = Array.from({ length: 8 }, (_, i) => `ABCD-${String(i).padStart(4, "0")}`);
      vi.mocked(recoveryModule.generateAndStoreRecoveryCodes).mockResolvedValue(mockCodes);

      const codes = await userSettingsService.generateRecoveryCodes(userId);

      expect(codes).toHaveLength(8);
      expect(recoveryModule.generateAndStoreRecoveryCodes).toHaveBeenCalledWith(userId, 8);
      expect(securityEventModule.logSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "RECOVERY_CODES_GENERATED", success: true })
      );
    });
  });
});
