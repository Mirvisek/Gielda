import Redis from "ioredis";

export type RateLimitAction =
  | "login"
  | "password"
  | "recovery"
  | "passkey_auth"
  | "passkey_reg"
  | "oauth"
  | "admin";

interface RateLimitConfig {
  maxAttempts: number;
  windowSeconds: number;
}

const ACTION_CONFIGS: Record<RateLimitAction, RateLimitConfig> = {
  login: { maxAttempts: 5, windowSeconds: 15 * 60 },
  password: { maxAttempts: 5, windowSeconds: 15 * 60 },
  recovery: { maxAttempts: 3, windowSeconds: 15 * 60 },
  passkey_auth: { maxAttempts: 10, windowSeconds: 15 * 60 },
  passkey_reg: { maxAttempts: 5, windowSeconds: 15 * 60 },
  oauth: { maxAttempts: 10, windowSeconds: 15 * 60 },
  admin: { maxAttempts: 20, windowSeconds: 15 * 60 },
};

// Singleton Redis Client dla Rate Limitingu z leniwym połączeniem
let redisClient: Redis | null = null;
let redisAvailable = false;

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redisClient.on("connect", () => {
      redisAvailable = true;
    });
    redisClient.on("error", () => {
      redisAvailable = false;
    });
  } catch {
    redisAvailable = false;
  }
}

// Pamięciowy fallback do testów i lokalnego developmentu bez Redisa
const inMemoryStore = new Map<string, { count: number; expiresAt: number }>();

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Sprawdza i inkrementuje licznik zapytań dla danego klucza (np. IP lub IP+Email).
 */
export async function checkRateLimit(
  action: RateLimitAction,
  identifier: string
): Promise<RateLimitResult> {
  const config = ACTION_CONFIGS[action] || { maxAttempts: 10, windowSeconds: 60 };
  const key = `ratelimit:${action}:${identifier}`;

  // 1. Próba użycia Redisa
  if (redisClient && redisAvailable) {
    try {
      const current = await redisClient.incr(key);
      if (current === 1) {
        await redisClient.expire(key, config.windowSeconds);
      }
      const ttl = await redisClient.ttl(key);
      const remaining = Math.max(0, config.maxAttempts - current);
      return {
        success: current <= config.maxAttempts,
        remaining,
        resetInSeconds: Math.max(1, ttl),
      };
    } catch {
      // W razie awarii Redisa przejdź do fallbacku pamięciowego
      redisAvailable = false;
    }
  }

  // 2. Pamięciowy fallback (In-Memory)
  const now = Date.now();
  const entry = inMemoryStore.get(key);

  if (!entry || entry.expiresAt <= now) {
    inMemoryStore.set(key, {
      count: 1,
      expiresAt: now + config.windowSeconds * 1000,
    });
    return {
      success: true,
      remaining: config.maxAttempts - 1,
      resetInSeconds: config.windowSeconds,
    };
  }

  entry.count += 1;
  const resetInSeconds = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
  const remaining = Math.max(0, config.maxAttempts - entry.count);

  return {
    success: entry.count <= config.maxAttempts,
    remaining,
    resetInSeconds,
  };
}

/**
 * Resetuje licznik limitu (np. po pomyślnym zalogowaniu).
 */
export async function resetRateLimit(action: RateLimitAction, identifier: string): Promise<void> {
  const key = `ratelimit:${action}:${identifier}`;
  if (redisClient && redisAvailable) {
    try {
      await redisClient.del(key);
    } catch {
      // Ignoruj błąd kasowania
    }
  }
  inMemoryStore.delete(key);
}
