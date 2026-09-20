import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, verifyPassword, validatePasswordPolicy } from "@/lib/auth/password";
import { timingSafeEqualString } from "@/lib/security/constant-time";
import { generateSecureToken, hashToken } from "@/lib/auth/tokens";
import { checkRateLimit, resetRateLimit } from "@/lib/security/rate-limit";

describe("Etap 1: Bezpieczeństwo i Autentykacja", () => {
  describe("Argon2id Hashing & Policy", () => {
    it("should hash and verify passwords correctly using Argon2id", async () => {
      const password = "SuperTajneHaslo123!";
      const hash = await hashPassword(password);

      expect(hash).toContain("$argon2id$");
      const isValid = await verifyPassword(hash, password);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword(hash, "ZleHaslo123");
      expect(isInvalid).toBe(false);
    });

    it("should enforce password policy (min 12 characters)", () => {
      const short = validatePasswordPolicy("Krotkie1!");
      expect(short.valid).toBe(false);
      expect(short.error).toContain("12 znaków");

      const valid = validatePasswordPolicy("BezpieczneHasloDlugie123!");
      expect(valid.valid).toBe(true);
    });
  });

  describe("CSPRNG Tokens & SHA-256 Hashing", () => {
    it("should generate high entropy 256-bit hex tokens", () => {
      const token1 = generateSecureToken(32);
      const token2 = generateSecureToken(32);

      expect(token1.length).toBe(64); // 32 bajty = 64 znaki hex
      expect(token2.length).toBe(64);
      expect(token1).not.toBe(token2);
    });

    it("should produce deterministic SHA-256 hashes", () => {
      const token = "my-secret-session-token";
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });
  });

  describe("Constant-time Comparison", () => {
    it("should safely compare identical and different strings", () => {
      expect(timingSafeEqualString("tajny_skrot_123", "tajny_skrot_123")).toBe(true);
      expect(timingSafeEqualString("tajny_skrot_123", "inny_skrot_123")).toBe(false);
      expect(timingSafeEqualString("krotki", "dlugi_string_porownawczy")).toBe(false);
    });
  });

  describe("Rate Limiting (In-Memory Fallback)", () => {
    const testIp = "192.0.2.1";

    beforeEach(async () => {
      await resetRateLimit("password", testIp);
    });

    it("should limit attempts after max attempts reached", async () => {
      // Limit dla 'password' to 5 prób
      for (let i = 0; i < 5; i++) {
        const res = await checkRateLimit("password", testIp);
        expect(res.success).toBe(true);
      }

      // 6. próba powinna zostać zablokowana
      const blocked = await checkRateLimit("password", testIp);
      expect(blocked.success).toBe(false);
      expect(blocked.remaining).toBe(0);

      // Po zresetowaniu powinno znów zezwolić
      await resetRateLimit("password", testIp);
      const resetAttempt = await checkRateLimit("password", testIp);
      expect(resetAttempt.success).toBe(true);
    });
  });
});
