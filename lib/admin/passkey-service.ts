import prisma from "@/lib/db/prisma";
import { recordAuditLog } from "./audit-service";

/**
 * Pobiera listę wszystkich zarejestrowanych kluczy Passkey w systemie (bez eksponowania kluczy publicznych).
 */
export async function listAllPasskeys() {
  return await prisma.passkey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      credentialId: true,
      deviceType: true,
      createdAt: true,
      lastUsedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Odwołuje/usuwa klucz Passkey przez administratora.
 */
export async function revokePasskeyByAdmin(passkeyId: string, actorAdminId: string) {
  const passkey = await prisma.passkey.findUnique({
    where: { id: passkeyId },
    include: { user: true },
  });

  if (!passkey) {
    throw new Error("Klucz Passkey nie został odnaleziony.");
  }

  await prisma.passkey.delete({
    where: { id: passkeyId },
  });

  await recordAuditLog({
    actorUserId: actorAdminId,
    action: "ADMIN_PASSKEY_REVOKED",
    targetType: "PASSKEY",
    targetId: passkeyId,
    metadata: {
      passkeyName: passkey.name,
      targetUserId: passkey.userId,
      targetEmail: passkey.user.email,
    },
  });

  return { success: true };
}
