import Redis from "ioredis";

let redisClient: Redis | null = null;
let isRedisAvailable = false;

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redisClient.on("connect", () => {
      isRedisAvailable = true;
    });
    redisClient.on("error", () => {
      isRedisAvailable = false;
    });
  } catch {
    isRedisAvailable = false;
  }
}

// Pamięciowy fallback cache (In-Memory)
const memoryCache = new Map<string, { data: string; expiresAt: number }>();

export const CACHE_TTL = {
  QUOTE: 60, // 60 sekund
  HISTORICAL: 15 * 60, // 15 minut
  INDICATORS: 15 * 60, // 15 minut
  METADATA: 24 * 60 * 60, // 24 godziny
};

export async function getFromCache<T>(key: string): Promise<T | null> {
  // 1. Sprawdź Redis
  if (redisClient && isRedisAvailable) {
    try {
      const raw = await redisClient.get(key);
      if (raw) {
        return JSON.parse(raw) as T;
      }
    } catch {
      isRedisAvailable = false;
    }
  }

  // 2. Fallback pamięciowy
  const entry = memoryCache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }

  try {
    return JSON.parse(entry.data) as T;
  } catch {
    return null;
  }
}

export async function setInCache<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
  const jsonStr = JSON.stringify(data);

  if (redisClient && isRedisAvailable) {
    try {
      await redisClient.set(key, jsonStr, "EX", ttlSeconds);
      return;
    } catch {
      isRedisAvailable = false;
    }
  }

  memoryCache.set(key, {
    data: jsonStr,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export async function invalidateCache(keyPrefix: string): Promise<void> {
  if (redisClient && isRedisAvailable) {
    try {
      const keys = await redisClient.keys(`${keyPrefix}*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch {
      // Ignoruj
    }
  }

  for (const k of memoryCache.keys()) {
    if (k.startsWith(keyPrefix)) {
      memoryCache.delete(k);
    }
  }
}

export async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  if (redisClient && isRedisAvailable) {
    try {
      const res = await redisClient.set(key, "1", "EX", ttlSeconds, "NX");
      return res === "OK";
    } catch {
      isRedisAvailable = false;
    }
  }

  const existing = memoryCache.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    return false;
  }
  memoryCache.set(key, { data: "1", expiresAt: Date.now() + ttlSeconds * 1000 });
  return true;
}

export async function releaseLock(key: string): Promise<void> {
  if (redisClient && isRedisAvailable) {
    try {
      await redisClient.del(key);
    } catch {
      // Ignoruj
    }
  }
  memoryCache.delete(key);
}
