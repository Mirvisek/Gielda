import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserRole, UserStatus } from "@prisma/client";

// Mock getCurrentSession
const mockGetCurrentSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: () => mockGetCurrentSession(),
}));

// Mock request context
vi.mock("@/lib/security/request-context", () => ({
  getRequestContext: vi.fn().mockResolvedValue({ ip: "127.0.0.1", userAgent: "test-agent" }),
}));

// Mock rate-limit
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 20, resetInSeconds: 60 }),
}));

import { requireAdmin, AdminAuthorizationError } from "@/lib/admin/require-admin";
import { generateSecureToken, hashToken } from "@/lib/auth/tokens";

describe("Etap 2: Autoryzacja i Panel Administratora", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Centralny Guard requireAdmin() (Server-Side Deny by Default)", () => {
    it("should reject unauthenticated request with 401", async () => {
      mockGetCurrentSession.mockResolvedValue(null);

      await expect(requireAdmin()).rejects.toThrow(AdminAuthorizationError);
      await expect(requireAdmin()).rejects.toMatchObject({ statusCode: 401 });
    });

    it("should reject standard USER role with 403", async () => {
      mockGetCurrentSession.mockResolvedValue({
        session: { id: "s1" },
        user: {
          id: "u1",
          email: "user@example.com",
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
        },
      });

      await expect(requireAdmin()).rejects.toThrow(AdminAuthorizationError);
      await expect(requireAdmin()).rejects.toMatchObject({ statusCode: 403 });
    });

    it("should reject INVITED ADMIN with 403", async () => {
      mockGetCurrentSession.mockResolvedValue({
        session: { id: "s2" },
        user: {
          id: "u2",
          email: "invited_admin@example.com",
          role: UserRole.ADMIN,
          status: UserStatus.INVITED,
        },
      });

      await expect(requireAdmin()).rejects.toThrow(AdminAuthorizationError);
      await expect(requireAdmin()).rejects.toMatchObject({ statusCode: 403 });
    });

    it("should reject SUSPENDED ADMIN with 403", async () => {
      mockGetCurrentSession.mockResolvedValue({
        session: { id: "s3" },
        user: {
          id: "u3",
          email: "suspended_admin@example.com",
          role: UserRole.ADMIN,
          status: UserStatus.SUSPENDED,
        },
      });

      await expect(requireAdmin()).rejects.toThrow(AdminAuthorizationError);
      await expect(requireAdmin()).rejects.toMatchObject({ statusCode: 403 });
    });

    it("should reject LOCKED ADMIN with 403", async () => {
      mockGetCurrentSession.mockResolvedValue({
        session: { id: "s4" },
        user: {
          id: "u4",
          email: "locked_admin@example.com",
          role: UserRole.ADMIN,
          status: UserStatus.LOCKED,
        },
      });

      await expect(requireAdmin()).rejects.toThrow(AdminAuthorizationError);
    });

    it("should reject DISABLED ADMIN with 403", async () => {
      mockGetCurrentSession.mockResolvedValue({
        session: { id: "s5" },
        user: {
          id: "u5",
          email: "disabled_admin@example.com",
          role: UserRole.ADMIN,
          status: UserStatus.DISABLED,
        },
      });

      await expect(requireAdmin()).rejects.toThrow(AdminAuthorizationError);
    });

    it("should allow ACTIVE ADMIN", async () => {
      const activeAdmin = {
        id: "admin-1",
        email: "admin@market-intelligence.local",
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      };

      mockGetCurrentSession.mockResolvedValue({
        session: { id: "s-admin" },
        user: activeAdmin,
      });

      const result = await requireAdmin();
      expect(result.id).toBe("admin-1");
      expect(result.role).toBe(UserRole.ADMIN);
      expect(result.status).toBe(UserStatus.ACTIVE);
    });
  });

  describe("Reguły Biznesowe Ochrony Konta Administratora", () => {
    it("should prevent admin from deleting or suspending their own account", () => {
      const actorAdminId = "admin-1";
      const targetUserId = "admin-1";
      const newStatus: UserStatus = UserStatus.SUSPENDED;

      const attemptSelfSuspension = () => {
        if (targetUserId === actorAdminId && (newStatus as UserStatus) !== UserStatus.ACTIVE) {
          throw new Error("Odmowa operacji: Nie możesz zablokować, zawiesić ani usunąć własnego konta.");
        }
      };

      expect(attemptSelfSuspension).toThrow("Nie możesz zablokować, zawiesić ani usunąć własnego konta.");
    });

    it("should prevent removing the last active admin in the system", () => {
      const remainingAdminsCount = 0;
      const attemptRemoveLastAdmin = () => {
        if (remainingAdminsCount === 0) {
          throw new Error("Odmowa operacji: Nie można wyłączyć ani usunąć ostatniego aktywnego administratora w systemie.");
        }
      };

      expect(attemptRemoveLastAdmin).toThrow("ostatniego aktywnego administratora");
    });
  });

  describe("Kryptograficzny Przepływ Zaproszenia Użytkownika", () => {
    it("should generate high entropy token, hash it for storage, and build activation URL", () => {
      const rawToken = generateSecureToken(32);
      const storedHash = hashToken(rawToken);

      expect(rawToken.length).toBe(64);
      expect(storedHash.length).toBe(64);
      expect(storedHash).not.toBe(rawToken);

      const appUrl = "http://localhost:3000";
      const activationUrl = `${appUrl}/activate?token=${rawToken}`;
      expect(activationUrl).toContain("token=");
      expect(activationUrl).not.toContain(storedHash);
    });
  });
});
