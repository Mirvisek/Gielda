import crypto from "crypto";
import Redis from "ioredis";

// Singleton Redis dla krótkotrwałych wyzwań (challenges)
let redisClient: Redis | null = null;
if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
  } catch {
    redisClient = null;
  }
}

const memoryChallengeStore = new Map<string, { value: string; expiresAt: number }>();

/**
 * Generuje kryptograficznie bezpieczny token o zadanym rozmiarze (domyślnie 32 bajty = 256 bitów entropii).
 */
export function generateSecureToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Oblicza skrót SHA-256 tokenu w formacie heksadecymalnym.
 * Używany do bezpiecznego przechowywania tokenów sesyjnych i linków aktywacyjnych w bazie.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Zapisuje jednorazowe wyzwanie (challenge) np. dla WebAuthn z krótkim czasem życia (TTL 5 minut).
 */
export async function saveChallenge(key: string, challenge: string, ttlSeconds: number = 300): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.set(`challenge:${key}`, challenge, "EX", ttlSeconds);
      return;
    } catch {
      // Fallback do pamięci
    }
  }

  memoryChallengeStore.set(key, {
    value: challenge,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Pobiera i natychmiast usuwa jednorazowe wyzwanie (single-use).
 */
export async function consumeChallenge(key: string): Promise<string | null> {
  if (redisClient) {
    try {
      const challenge = await redisClient.get(`challenge:${key}`);
      if (challenge) {
        await redisClient.del(`challenge:${key}`);
        return challenge;
      }
    } catch {
      // Fallback do pamięci
    }
  }

  const entry = memoryChallengeStore.get(key);
  if (!entry) return null;

  memoryChallengeStore.delete(key);
  if (entry.expiresAt <= Date.now()) {
    return null;
  }

  return entry.value;
}
