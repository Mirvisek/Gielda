import { hash, verify } from "@node-rs/argon2";

/**
 * Konfiguracja parametrów Argon2id zgodnie z zaleceniami OWASP:
 * - Algorytm: Argon2id (kod 2 w @node-rs/argon2)
 * - Pamięć: minimum 19 MiB (19456 KiB)
 * - Iteracje (timeCost): 2
 * - Parallelism: 1
 * - Długość skrótu: 32 bajty
 */
const ARGON2_OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

/**
 * Haszuje hasło za pomocą algorytmu Argon2id.
 */
export async function hashPassword(password: string): Promise<string> {
  return await hash(password, ARGON2_OPTIONS);
}

/**
 * Bezpiecznie weryfikuje hasło z hashem Argon2id.
 */
export async function verifyPassword(hashString: string, password: string): Promise<boolean> {
  try {
    return await verify(hashString, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

/**
 * Waliduje politykę haseł (zgodnie z pkt 14: rozsądna minimalna długość min. 12 znaków, bez absurdalnych ograniczeń).
 */
export function validatePasswordPolicy(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 12) {
    return {
      valid: false,
      error: "Hasło musi mieć co najmniej 12 znaków.",
    };
  }
  if (password.length > 128) {
    return {
      valid: false,
      error: "Hasło nie może przekraczać 128 znaków.",
    };
  }
  return { valid: true };
}
