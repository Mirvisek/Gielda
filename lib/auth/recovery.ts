import crypto from "crypto";
import prisma from "@/lib/db/prisma";
import { hashToken } from "./tokens";
import { logSecurityEvent } from "@/lib/security/security-event";
import { timingSafeEqualString } from "@/lib/security/constant-time";

/**
 * Generuje pojedynczy czytelny kod recovery w formacie XXXX-XXXX (np. A8F2-19KD).
 */
function generateSingleCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Bez mylących znaków (0/O, 1/I)
  let part1 = "";
  let part2 = "";
  const randomBytes = crypto.randomBytes(8);

  for (let i = 0; i < 4; i++) {
    part1 += chars[randomBytes[i] % chars.length];
    part2 += chars[randomBytes[i + 4] % chars.length];
  }

  return `${part1}-${part2}`;
}

/**
 * Generuje zestaw jednorazowych kodów recovery (np. 8 kodów) dla użytkownika.
 * Zwraca kody jawne (do jednorazowego wyświetlenia użytkownikowi) oraz zapisuje ich hashe SHA-256 w bazie.
 */
export async function generateAndStoreRecoveryCodes(
  userId: string,
  count: number = 8
): Promise<string[]> {
  const plainCodes: string[] = [];
  const operations = [];

  // Usuń poprzednie nieużyte kody recovery tego użytkownika
  await prisma.recoveryCode.deleteMany({
    where: {
      userId,
      usedAt: null,
    },
  });

  for (let i = 0; i < count; i++) {
    const code = generateSingleCode();
    plainCodes.push(code);

    // Zapisz hash SHA-256 znormalizowanego kodu
    const normalizedCode = code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const codeHash = hashToken(normalizedCode);

    operations.push(
      prisma.recoveryCode.create({
        data: {
          userId,
          codeHash,
        },
      })
    );
  }

  await prisma.$transaction(operations);

  return plainCodes;
}

/**
 * Weryfikuje i zużywa jednorazowy kod recovery.
 * Każdy kod może być użyty tylko raz. Po użyciu zostaje oznaczony datą `usedAt`.
 */
export async function verifyAndConsumeRecoveryCode(
  userId: string,
  inputCode: string
): Promise<boolean> {
  const normalized = inputCode.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const inputHash = hashToken(normalized);

  const activeCodes = await prisma.recoveryCode.findMany({
    where: {
      userId,
      usedAt: null,
    },
  });

  for (const record of activeCodes) {
    if (timingSafeEqualString(record.codeHash, inputHash)) {
      // Oznacz kod jako natychmiast zużyty
      await prisma.recoveryCode.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });

      await logSecurityEvent({
        userId,
        eventType: "RECOVERY_CODE_USED",
        success: true,
        metadata: { codeId: record.id },
      });

      return true;
    }
  }

  await logSecurityEvent({
    userId,
    eventType: "LOGIN_FAILURE",
    success: false,
    metadata: { reason: "INVALID_RECOVERY_CODE" },
  });

  return false;
}
