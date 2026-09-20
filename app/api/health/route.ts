import { NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

export async function GET() {
  const health: {
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: string;
    services: {
      app: "healthy";
      database: "healthy" | "unreachable" | "disabled";
      redis: "healthy" | "unreachable" | "disabled";
    };
  } = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      app: "healthy",
      database: "unreachable",
      redis: "unreachable",
    },
  };

  // 1. Sprawdzenie połączenia z bazą danych MariaDB
  if (!process.env.DATABASE_URL) {
    health.services.database = "disabled";
  } else {
    try {
      // Szybkie sprawdzenie z limitem czasu
      await prisma.$queryRaw`SELECT 1`;
      health.services.database = "healthy";
    } catch {
      health.services.database = "unreachable";
      health.status = "degraded";
    }
  }

  // 2. Sprawdzenie połączenia z Redis
  if (!process.env.REDIS_URL) {
    health.services.redis = "disabled";
  } else {
    try {
      const redis = new Redis(process.env.REDIS_URL, {
        connectTimeout: 2000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
      redis.on("error", () => {});
      await redis.connect();
      await redis.ping();
      await redis.quit();
      health.services.redis = "healthy";
    } catch {
      health.services.redis = "unreachable";
      health.status = "degraded";
    }
  }

  const statusCode = health.status === "healthy" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
