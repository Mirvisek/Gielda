import prisma from "@/lib/db/prisma";
import { getRequestContext } from "./request-context";
import { NextRequest } from "next/server";

export type SecurityEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "PASSWORD_CHANGED"
  | "SESSION_CREATED"
  | "SESSION_REVOKED"
  | "SESSIONS_REVOKED_ALL"
  | "PASSKEY_REGISTERED"
  | "PASSKEY_USED"
  | "PASSKEY_REMOVED"
  | "RECOVERY_CODE_USED"
  | "RECOVERY_CODES_GENERATED"
  | "ACCOUNT_LOCKED"
  | "RATE_LIMITED"
  | "SUSPICIOUS_AUTH";

interface LogSecurityEventParams {
  userId?: string | null;
  eventType: SecurityEventType;
  success: boolean;
  req?: NextRequest;
  deviceId?: string;
  metadata?: Record<string, unknown>;
}

// Lista zabronionych kluczy, których wartości NIGDY nie mogą trafić do logów
const FORBIDDEN_METADATA_KEYS = new Set([
  "password",
  "password_hash",
  "token",
  "session_token",
  "cookie",
  "cookies",
  "secret",
  "api_key",
  "private_key",
  "recovery_code",
  "code",
  "code_hash",
]);

/**
 * Maskuje i filtruje wszelkie wrażliwe dane przed zapisem do bazy.
 */
function sanitizeMetadata(metadata?: Record<string, unknown>): string | null {
  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }

  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) {
      clean[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null) {
      try {
        clean[key] = JSON.parse(JSON.stringify(val));
      } catch {
        clean[key] = "[COMPLEX_OBJECT]";
      }
    } else {
      clean[key] = val;
    }
  }

  return JSON.stringify(clean);
}

/**
 * Rejestruje zdarzenie bezpieczeństwa w tabeli `security_events`.
 */
export async function logSecurityEvent({
  userId,
  eventType,
  success,
  req,
  deviceId,
  metadata,
}: LogSecurityEventParams): Promise<void> {
  try {
    const ctx = await getRequestContext(req);
    const sanitizedMetadata = sanitizeMetadata(metadata);

    await prisma.securityEvent.create({
      data: {
        userId: userId || null,
        eventType,
        success,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent.slice(0, 500),
        deviceId: deviceId ? deviceId.slice(0, 128) : null,
        metadata: sanitizedMetadata,
      },
    });
  } catch (error) {
    // Awaria logowania nie powinna blokować krytycznych przepływów aplikacji, ale musi być odnotowana
    console.error("[SecurityEvent Log Error]:", error);
  }
}
