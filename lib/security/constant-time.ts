import crypto from "crypto";

/**
 * Bezpieczne porównanie dwóch ciągów w stałym czasie (constant-time comparison).
 * Zapobiega atakom typu timing attack.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) {
    // Porównanie z samym sobą, aby nie zdradzić długości timingiem
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
