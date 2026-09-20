import prisma from "@/lib/db/prisma";
import { getRequestContext } from "@/lib/security/request-context";

export type AdminAuditAction =
  | "ADMIN_USER_CREATED"
  | "ADMIN_USER_STATUS_CHANGED"
  | "ADMIN_AUTH_METHODS_UPDATED"
  | "ADMIN_SESSION_REVOKED"
  | "ADMIN_ALL_SESSIONS_REVOKED"
  | "ADMIN_PASSKEY_REVOKED"
  | "ADMIN_ACTIVATION_RESENT";

interface RecordAuditLogParams {
  actorUserId: string;
  action: AdminAuditAction;
  targetType: "USER" | "SESSION" | "PASSKEY" | "AUTH_METHOD";
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Rejestruje operację administracyjną w tabeli `audit_logs`.
 * Tabela audytu jest ściśle dopisywana (append-only) – brak możliwości edycji ani usuwania przez API.
 */
export async function recordAuditLog({
  actorUserId,
  action,
  targetType,
  targetId,
  metadata,
}: RecordAuditLogParams): Promise<void> {
  const ctx = await getRequestContext();

  let sanitizedMeta: string | null = null;
  if (metadata) {
    // Usunięcie ewentualnych wrażliwych kluczy
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(metadata)) {
      if (!k.toLowerCase().includes("password") && !k.toLowerCase().includes("token") && !k.toLowerCase().includes("secret")) {
        clean[k] = v;
      }
    }
    sanitizedMeta = JSON.stringify(clean);
  }

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action,
      targetType,
      targetId: targetId || null,
      ipAddress: ctx.ip,
      metadata: sanitizedMeta,
    },
  });
}

/**
 * Pobiera historię audytu z relacją do administratora wykonującego akcję.
 */
export async function getAuditLogs(limit: number = 50, offset: number = 0) {
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    }),
    prisma.auditLog.count(),
  ]);

  return { logs, total };
}

/**
 * Pobiera zdarzenia bezpieczeństwa (security_events) dla panelu administratora.
 */
export async function getSecurityEvents(limit: number = 50, offset: number = 0) {
  const [events, total] = await Promise.all([
    prisma.securityEvent.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    }),
    prisma.securityEvent.count(),
  ]);

  return { events, total };
}
