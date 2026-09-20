import { headers } from "next/headers";
import { NextRequest } from "next/server";

export interface RequestContext {
  ip: string;
  userAgent: string;
  origin: string;
}

/**
 * Bezpiecznie wyodrębnia kontekst żądania (IP, User-Agent, Origin).
 * Obsługuje nagłówki reverse proxy (Nginx: x-forwarded-for, x-real-ip).
 */
export async function getRequestContext(req?: NextRequest): Promise<RequestContext> {
  const reqHeaders = req ? req.headers : await headers();

  const forwardedFor = reqHeaders.get("x-forwarded-for");
  const realIp = reqHeaders.get("x-real-ip");
  
  // Pierwszy adres IP z x-forwarded-for to rzeczywisty adres klienta
  let ip = "127.0.0.1";
  if (forwardedFor) {
    ip = forwardedFor.split(",")[0].trim();
  } else if (realIp) {
    ip = realIp.trim();
  }

  const userAgent = reqHeaders.get("user-agent") || "unknown";
  const origin = reqHeaders.get("origin") || reqHeaders.get("referer") || process.env.APP_URL || "http://localhost:3000";

  return {
    ip,
    userAgent,
    origin,
  };
}
