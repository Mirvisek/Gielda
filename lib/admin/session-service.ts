import prisma from "@/lib/db/prisma";
import { recordAuditLog } from "./audit-service";

/**
 * Pobiera wszystkie aktywne sesje w całym systemie z danymi użytkownika.
 */
export async function listActiveSessions() {
  return await prisma.session.findMany({
    where: {
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastSeenAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Unieważnia wskazaną sesję przez administratora.
 */
export async function revokeSessionByAdmin(sessionId: string, actorAdminId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (!session) {
    throw new Error("Sesja nie istnieje.");
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });

  await recordAuditLog({
    actorUserId: actorAdminId,
    action: "ADMIN_SESSION_REVOKED",
    targetType: "SESSION",
    targetId: sessionId,
    metadata: { targetUserId: session.userId, targetEmail: session.user.email },
  });

  return { success: true };
}

/**
 * Unieważnia wszystkie sesje wskazanego użytkownika przez administratora.
 */
export async function revokeAllSessionsForUserByAdmin(targetUserId: string, actorAdminId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    throw new Error("Użytkownik nie istnieje.");
  }

  const result = await prisma.session.updateMany({
    where: {
      userId: targetUserId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  await recordAuditLog({
    actorUserId: actorAdminId,
    action: "ADMIN_ALL_SESSIONS_REVOKED",
    targetType: "SESSION",
    targetId: targetUserId,
    metadata: { revokedCount: result.count, targetEmail: user.email },
  });

  return { revokedCount: result.count };
}
